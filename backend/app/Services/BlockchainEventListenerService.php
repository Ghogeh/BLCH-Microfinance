<?php

namespace App\Services;

use App\Jobs\ProcessBlockchainEvent;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * BlockchainEventListenerService
 *
 * Polls the Ganache/Besu node for new blocks and dispatches
 * Laravel Queue jobs for each relevant event found.
 *
 * Design: the listener stores the last processed block in Redis cache.
 * On restart, it re-scans from (lastBlock - 10) to catch any events
 * missed during downtime. Event handlers are idempotent (tx_hash check)
 * so processing the same event twice is safe.
 */
class BlockchainEventListenerService
{
    private const CACHE_KEY            = 'blockchain:last_processed_block';
    private const REORG_SAFETY_BUFFER  = 10; // re-scan last N blocks on restart

    public function __construct(
        private BlockchainService $blockchain
    ) {}

    /**
     * Main polling loop. Called by the artisan command:
     *   php artisan edl:listen
     *
     * In production, this runs as a supervisor-managed process.
     */
    public function listen(): void
    {
        Log::info('[EDL Listener] Starting blockchain event listener...');
        Log::info('[EDL Listener] RPC URL: ' . config('blockchain.rpc_url'));

        $factoryAddress  = config('blockchain.contracts.loan_factory');
        $registryAddress = config('blockchain.contracts.identity_registry');

        Log::info("[EDL Listener] Watching LoanFactory: {$factoryAddress}");
        Log::info("[EDL Listener] Watching IdentityRegistry: {$registryAddress}");

        while (true) {
            try {
                $currentBlock = $this->blockchain->getBlockNumber();
                $fromBlock    = $this->getFromBlock();

                if ($fromBlock > $currentBlock) {
                    sleep(config('blockchain.poll_interval_seconds', 2));
                    continue;
                }

                $this->scanRange($fromBlock, $currentBlock);
                $this->setLastProcessedBlock($currentBlock);

                Log::debug("[EDL Listener] Scanned blocks {$fromBlock}→{$currentBlock}");

            } catch (\Throwable $e) {
                Log::error('[EDL Listener] Polling error: ' . $e->getMessage());
            }

            sleep(config('blockchain.poll_interval_seconds', 2));
        }
    }

    /**
     * Scan a block range for all tracked events across all watched contracts.
     */
    private function scanRange(int $fromBlock, int $toBlock): void
    {
        $contracts = [
            config('blockchain.contracts.loan_factory'),
            config('blockchain.contracts.identity_registry'),
        ];

        $signatures = config('blockchain.event_signatures');

        foreach ($contracts as $contract) {
            if (empty($contract)) continue;

            foreach ($signatures as $eventName => $sigHash) {
                if (empty($sigHash)) continue;

                $logs = $this->blockchain->getLogs(
                    $contract, $sigHash, $fromBlock, $toBlock
                );

                foreach ($logs as $log) {
                    // Dispatch an idempotent queue job for each log
                    ProcessBlockchainEvent::dispatch($eventName, $log, $contract)
                        ->onQueue('blockchain-events');
                }
            }
        }
    }

    // ── Block tracking ────────────────────────────────────────────────────────

    private function getFromBlock(): int
    {
        $last = Cache::get(self::CACHE_KEY);

        if ($last === null) {
            // First run: start from current block - 100 to catch recent events
            $current = $this->blockchain->getBlockNumber();
            return max(0, $current - 100);
        }

        // Apply reorg safety buffer on every restart
        return max(0, (int)$last - self::REORG_SAFETY_BUFFER);
    }

    private function setLastProcessedBlock(int $block): void
    {
        Cache::put(self::CACHE_KEY, $block, now()->addDays(30));
    }
}
