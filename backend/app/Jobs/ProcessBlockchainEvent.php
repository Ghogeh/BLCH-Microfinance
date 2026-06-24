<?php

namespace App\Jobs;

use App\Models\AuditLog;
use App\Models\Blacklist;
use App\Models\Loan;
use App\Models\LoanNotification;
use App\Models\Repayment;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * ProcessBlockchainEvent
 *
 * Processes a single on-chain event and syncs MySQL.
 * IDEMPOTENT: every handler checks tx_hash before writing.
 * If the tx_hash already exists in the relevant table, we skip silently.
 *
 * Event log format from eth_getLogs:
 * {
 *   address:          "0x..." (contract that emitted),
 *   topics:           ["0x...", "0x...", ...] (event sig + indexed params),
 *   data:             "0x..." (non-indexed params, ABI-encoded),
 *   transactionHash:  "0x...",
 *   blockNumber:      "0x...",
 * }
 */
class ProcessBlockchainEvent implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries  = 3;
    public int $backoff = 5; // seconds between retries

    public function __construct(
        private string $eventName,
        private array  $log,
        private string $contractAddress
    ) {}

    public function handle(): void
    {
        $txHash      = $this->log['transactionHash'];
        $blockNumber = hexdec($this->log['blockNumber']);

        Log::debug("[EDL Event] {$this->eventName} | tx: {$txHash} | block: {$blockNumber}");

        // Idempotency check — skip if already processed
        if ($this->alreadyProcessed($txHash)) {
            Log::debug("[EDL Event] Skipping duplicate event: {$txHash}");
            return;
        }

        try {
            match ($this->eventName) {
                'LoanContractDeployed' => $this->handleLoanCreated($txHash, $blockNumber),
                'Funded'               => $this->handleFunded($txHash, $blockNumber),
                'LoanDisbursed'        => $this->handleDisbursed($txHash, $blockNumber),
                'RepaymentMade'        => $this->handleRepayment($txHash, $blockNumber),
                'DefaultDeclared'      => $this->handleDefault($txHash, $blockNumber),
                'AddressBlacklisted'   => $this->handleBlacklist($txHash, $blockNumber),
                'IdentityVerified'     => $this->handleIdentityVerified($txHash, $blockNumber),
                default                => Log::debug("[EDL Event] Unhandled event: {$this->eventName}"),
            };

            // Record in audit_log that we processed this event
            AuditLog::create([
                'actor_role'       => 'contract',
                'action'           => $this->eventName,
                'entity_type'      => 'system',
                'contract_address' => $this->contractAddress,
                'tx_hash'          => $txHash,
                'block_number'     => $blockNumber,
                'details'          => ['raw_log_topics' => $this->log['topics'] ?? []],
            ]);

        } catch (\Throwable $e) {
            Log::error("[EDL Event] Failed to process {$this->eventName}: " . $e->getMessage());
            throw $e; // re-throw so the queue retries
        }
    }

    // ── Event handlers ────────────────────────────────────────────────────────

    private function handleLoanCreated(string $txHash, int $block): void
    {
        // LoanContractDeployed(address indexed loanContract, address indexed borrower, ...)
        $contractAddr = $this->decodeAddress($this->log['topics'][1] ?? '');
        $borrowerAddr = $this->decodeAddress($this->log['topics'][2] ?? '');

        $loan = Loan::where('contract_address', $contractAddr)->first();
        if (!$loan) {
            Log::warning("[EDL Event] LoanContractDeployed: no MySQL record for {$contractAddr}");
            return;
        }

        $loan->update(['loan_id_on_chain' => $block, 'created_tx_hash' => $txHash]);

        LoanNotification::create([
            'user_id'              => $loan->borrower_id,
            'loan_id'              => $loan->id,
            'type'                 => 'LOAN_CREATED',
            'title'                => 'Loan Request Confirmed On-Chain',
            'message'              => "Your loan of {$loan->amount_cfa} CFA has been recorded on the blockchain. Awaiting peer guarantees.",
            'trigger_tx_hash'      => $txHash,
            'trigger_block_number' => $block,
        ]);
    }

    private function handleDisbursed(string $txHash, int $block): void
    {
        $loan = Loan::where('contract_address', $this->contractAddress)
            ->where('state', 'FUNDING')->first();

        if (!$loan) {
            Log::warning("[EDL Event] LoanDisbursed: no FUNDING loan at {$this->contractAddress}");
            return;
        }

        $loan->update(['state' => 'ACTIVE', 'disbursed_at' => now()]);

        LoanNotification::create([
            'user_id'         => $loan->borrower_id,
            'loan_id'         => $loan->id,
            'type'            => 'LOAN_DISBURSED',
            'title'           => 'Loan Disbursed!',
            'message'         => "Your loan of {$loan->amount_cfa} CFA has been disbursed on block #{$block}.",
            'trigger_tx_hash' => $txHash,
        ]);
    }

    private function handleRepayment(string $txHash, int $block): void
    {
        if (Repayment::where('tx_hash', $txHash)->exists()) return;

        $loan = Loan::where('contract_address', $this->contractAddress)->first();
        if (!$loan) return;

        $data      = ltrim($this->log['data'] ?? '0x', '0x');
        $amountWei = hexdec(substr($data, 0, 64));
        $remaining = hexdec(substr($data, 64, 64));

        Repayment::create([
            'loan_id'             => $loan->id,
            'borrower_id'         => $loan->borrower_id,
            'amount_paid_cfa'     => $amountWei,
            'remaining_after_cfa' => $remaining,
            'tx_hash'             => $txHash,
            'block_number'        => $block,
            'on_chain_timestamp'  => now(),
            'was_on_time'         => now()->lte($loan->due_date),
            'days_late'           => now()->gt($loan->due_date) ? (int)now()->diffInDays($loan->due_date) : 0,
        ]);

        $loan->update(['remaining_balance_cfa' => $remaining]);
        if ($remaining <= 0) {
            $loan->update(['state' => 'REPAID', 'repaid_at' => now()]);
        }
    }

    private function handleDefault(string $txHash, int $block): void
    {
        $loan = Loan::where('contract_address', $this->contractAddress)
            ->where('state', 'ACTIVE')->first();
        if (!$loan) return;

        $data        = ltrim($this->log['data'] ?? '0x', '0x');
        $daysOverdue = hexdec(substr($data, 0, 64));

        $loan->update(['state' => 'DEFAULTED', 'defaulted_at' => now(), 'days_overdue' => $daysOverdue]);

        LoanNotification::create([
            'user_id'         => $loan->borrower_id,
            'loan_id'         => $loan->id,
            'type'            => 'DEFAULT_DECLARED',
            'title'           => 'Loan Declared Defaulted',
            'message'         => "Your loan has been marked as defaulted after {$daysOverdue} days overdue.",
            'trigger_tx_hash' => $txHash,
        ]);
    }

    private function handleBlacklist(string $txHash, int $block): void
    {
        $walletAddr = $this->decodeAddress($this->log['topics'][1] ?? '');
        $user       = User::where('wallet_address', $walletAddr)->first();
        if (!$user) return;

        $user->update(['blacklisted' => true]);

        if (!Blacklist::where('user_id', $user->id)->exists()) {
            Blacklist::create([
                'user_id'         => $user->id,
                'wallet_address'  => $walletAddr,
                'days_overdue'    => 90,
                'reason'          => 'CEMAC 2026: automatic blacklisting (on-chain event)',
                'on_chain_tx'     => $txHash,
                'on_chain_block'  => $block,
            ]);
        }
    }

    private function handleIdentityVerified(string $txHash, int $block): void
    {
        $walletAddr = $this->decodeAddress($this->log['topics'][1] ?? '');
        User::where('wallet_address', $walletAddr)->update(['kyc_status' => 'verified']);
    }

    private function handleFunded(string $txHash, int $block): void
    {
        $loan = Loan::where('contract_address', $this->contractAddress)->first();
        if (!$loan) return;

        $data           = ltrim($this->log['data'] ?? '0x', '0x');
        $totalFundedWei = hexdec(substr($data, 64, 64)); // second word = totalFunded

        $loan->update(['total_funded_cfa' => $totalFundedWei]);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function decodeAddress(string $topic): string
    {
        $clean = ltrim($topic, '0x');
        return '0x' . substr($clean, 24); // last 20 bytes of 32-byte topic
    }

    private function alreadyProcessed(string $txHash): bool
    {
        return AuditLog::where('tx_hash', $txHash)
            ->where('actor_role', 'contract')
            ->exists();
    }
}
