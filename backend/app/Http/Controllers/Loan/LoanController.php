<?php

namespace App\Http\Controllers\Loan;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Blacklist;
use App\Models\Loan;
use App\Models\LoanConsent;
use App\Models\LoanFunder;
use App\Models\LoanGuarantor;
use App\Models\LoanNotification;
use App\Models\Repayment;
use App\Models\User;
use App\Services\LoanFactoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LoanController extends Controller
{
    public function __construct(
        private LoanFactoryService $loanService
    ) {}

    /**
     * GET /api/loans
     * List loans visible to the current user based on role.
     */
    public function index(Request $request): JsonResponse
    {
        $user  = $request->user();
        $query = Loan::with(['borrower', 'guarantors.guarantor', 'funders.funder'])->latest();

        $query = match ($user->role) {
            'entrepreneur'        => $query->where('borrower_id', $user->id),
            'lender'              => $query->whereIn('state', ['FUNDING', 'ACTIVE', 'REPAID', 'DEFAULTED']),
            'officer'             => $query->whereIn('state', ['OPEN', 'FUNDING', 'ACTIVE']),
            'regulator', 'admin'  => $query,
            default               => $query->where('id', 0),
        };

        return response()->json($query->paginate(20));
    }

    /**
     * POST /api/loans
     * Entrepreneur creates a new loan request.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'amount_cfa'          => ['required', 'numeric', 'min:50000', 'max:500000'],
            'duration_days'       => ['required', 'integer', 'min:7', 'max:365'],
            'interest_rate_bps'   => ['required', 'integer', 'min:0', 'max:3000'],
            'required_guarantees' => ['nullable', 'integer', 'min:1', 'max:10'],
        ]);

        $user      = $request->user();
        $amountWei = (int)$request->input('amount_cfa');

        try {
            $receipt = $this->loanService->createLoan(
                $user->wallet_address,
                $amountWei,
                $request->input('duration_days'),
                $request->input('interest_rate_bps')
            );

            $contractAddress = $this->loanService->getLatestLoanForBorrower($user->wallet_address);

            $interestBps      = $request->input('interest_rate_bps');
            $amountCfa        = $request->input('amount_cfa');
            $totalRepayable   = $amountCfa + ($amountCfa * $interestBps / 10000);

            $loan = Loan::create([
                'contract_address'      => $contractAddress,
                'created_tx_hash'       => $receipt['txHash'],
                'borrower_id'           => $user->id,
                'amount_cfa'            => $amountCfa,
                'amount_wei'            => (string)$amountWei,
                'duration_days'         => $request->input('duration_days'),
                'interest_rate_bps'     => $interestBps,
                'state'                 => 'OPEN',
                'remaining_balance_cfa' => $totalRepayable,
                'due_date'              => now()->addDays($request->input('duration_days')),
                'required_guarantees'   => $request->input('required_guarantees', 1),
            ]);

            AuditLog::create([
                'actor_id'         => $user->id,
                'actor_role'       => 'entrepreneur',
                'action'           => 'LOAN_CREATED',
                'entity_type'      => 'loan',
                'entity_id'        => $loan->id,
                'contract_address' => $contractAddress,
                'tx_hash'          => $receipt['txHash'],
                'details'          => ['amount_cfa' => $amountCfa],
            ]);

            return response()->json([
                'message'          => 'Loan created successfully on-chain.',
                'loan_id'          => $loan->id,
                'contract_address' => $contractAddress,
                'tx_hash'          => $receipt['txHash'],
                'state'            => 'OPEN',
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'error'   => 'Loan creation failed on-chain.',
                'details' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * GET /api/loans/{id}
     */
    public function show(int $id): JsonResponse
    {
        $loan = Loan::with([
            'borrower', 'guarantors.guarantor', 'funders.funder', 'repayments', 'auditLogs',
        ])->findOrFail($id);

        $onChainState = null;
        if ($loan->contract_address) {
            try {
                $stateInt     = $this->loanService->getLoanState($loan->contract_address);
                $onChainState = ['OPEN', 'FUNDING', 'ACTIVE', 'REPAID', 'DEFAULTED'][$stateInt] ?? 'UNKNOWN';
            } catch (\Exception) {
                $onChainState = 'UNREADABLE';
            }
        }

        return response()->json([
            'loan'           => $loan,
            'on_chain_state' => $onChainState,
            'state_in_sync'  => $onChainState === null || $onChainState === $loan->state,
        ]);
    }

    /**
     * POST /api/loans/{id}/guarantee
     */
    public function guarantee(Request $request, int $id): JsonResponse
    {
        $loan = Loan::findOrFail($id);
        $user = $request->user();

        if ($loan->state !== 'OPEN') {
            return response()->json(['error' => "Loan must be OPEN. Current: {$loan->state}"], 422);
        }
        if ($loan->borrower_id === $user->id) {
            return response()->json(['error' => 'Borrowers cannot guarantee their own loans.'], 422);
        }

        try {
            $receipt = $this->loanService->provideGuarantee($loan->contract_address, $user->wallet_address);

            LoanGuarantor::create([
                'loan_id'       => $loan->id,
                'guarantor_id'  => $user->id,
                'tx_hash'       => $receipt['txHash'],
                'guaranteed_at' => now(),
                'status'        => 'active',
            ]);

            $loan->increment('current_guarantees');
            if ($loan->state === 'OPEN') {
                $loan->update(['state' => 'FUNDING']);
            }

            return response()->json([
                'message'          => 'Guarantee provided successfully on-chain.',
                'tx_hash'          => $receipt['txHash'],
                'guarantors_count' => $loan->fresh()->current_guarantees,
            ]);

        } catch (\Exception $e) {
            return response()->json(['error' => 'Guarantee failed.', 'details' => $e->getMessage()], 422);
        }
    }

    /**
     * POST /api/loans/{id}/fund
     */
    public function fund(Request $request, int $id): JsonResponse
    {
        $request->validate(['amount_cfa' => ['required', 'numeric', 'min:1']]);

        $loan = Loan::findOrFail($id);
        $user = $request->user();

        if ($loan->state !== 'FUNDING') {
            return response()->json(['error' => "Loan must be FUNDING. Current: {$loan->state}"], 422);
        }

        $amountWei = (int)$request->input('amount_cfa');

        try {
            $txHash   = $this->loanService->fund($loan->contract_address, $user->wallet_address, $amountWei);
            $newTotal = $loan->total_funded_cfa + $request->input('amount_cfa');

            LoanFunder::create([
                'loan_id'                 => $loan->id,
                'funder_id'               => $user->id,
                'amount_funded_cfa'       => $request->input('amount_cfa'),
                'tx_hash'                 => $txHash,
                'total_after_funding_cfa' => $newTotal,
                'funded_at'               => now(),
            ]);

            $loan->update(['total_funded_cfa' => $newTotal]);

            if ($newTotal >= $loan->amount_cfa) {
                $loan->update(['state' => 'ACTIVE', 'disbursed_at' => now()]);
            }

            AuditLog::create([
                'actor_id'    => $user->id,
                'actor_role'  => 'lender',
                'action'      => 'LOAN_FUNDED',
                'entity_type' => 'loan',
                'entity_id'   => $loan->id,
                'tx_hash'     => $txHash,
                'details'     => ['amount_cfa' => $request->input('amount_cfa')],
            ]);

            return response()->json([
                'message'           => 'Funding submitted on-chain.',
                'tx_hash'           => $txHash,
                'total_funded_cfa'  => $newTotal,
                'funding_progress'  => min(100, ($newTotal / $loan->amount_cfa) * 100),
                'auto_disbursed'    => $newTotal >= $loan->amount_cfa,
            ]);

        } catch (\Exception $e) {
            return response()->json(['error' => 'Funding failed.', 'details' => $e->getMessage()], 422);
        }
    }

    /**
     * POST /api/loans/{id}/repay
     */
    public function repay(Request $request, int $id): JsonResponse
    {
        $request->validate(['amount_cfa' => ['required', 'numeric', 'min:1']]);

        $loan = Loan::findOrFail($id);
        $user = $request->user();

        if ($loan->borrower_id !== $user->id) {
            return response()->json(['error' => 'You are not the borrower of this loan.'], 403);
        }
        if ($loan->state !== 'ACTIVE') {
            return response()->json(['error' => "Loan must be ACTIVE. Current: {$loan->state}"], 422);
        }

        $amountCFA = $request->input('amount_cfa');
        if ($amountCFA > $loan->remaining_balance_cfa) {
            return response()->json([
                'error'             => 'Repayment exceeds remaining balance.',
                'remaining_balance' => $loan->remaining_balance_cfa,
            ], 422);
        }

        try {
            $txHash     = $this->loanService->repay($loan->contract_address, $user->wallet_address, (int)$amountCFA);
            $newBalance = $loan->remaining_balance_cfa - $amountCFA;

            Repayment::create([
                'loan_id'             => $loan->id,
                'borrower_id'         => $user->id,
                'amount_paid_cfa'     => $amountCFA,
                'remaining_after_cfa' => $newBalance,
                'tx_hash'             => $txHash,
                'on_chain_timestamp'  => now(),
                'was_on_time'         => now()->lte($loan->due_date),
                'days_late'           => now()->gt($loan->due_date) ? (int)now()->diffInDays($loan->due_date) : 0,
            ]);

            $loan->update(['remaining_balance_cfa' => $newBalance]);
            if ($newBalance <= 0) {
                $loan->update(['state' => 'REPAID', 'repaid_at' => now()]);
            }

            return response()->json([
                'message'           => 'Repayment submitted on-chain.',
                'tx_hash'           => $txHash,
                'amount_paid_cfa'   => $amountCFA,
                'remaining_balance' => $newBalance,
                'loan_state'        => $loan->fresh()->state,
            ]);

        } catch (\Exception $e) {
            return response()->json(['error' => 'Repayment failed.', 'details' => $e->getMessage()], 422);
        }
    }

    /**
     * POST /api/loans/{id}/check-default
     */
    public function checkDefault(Request $request, int $id): JsonResponse
    {
        $loan = Loan::findOrFail($id);
        $user = $request->user();

        if ($loan->state !== 'ACTIVE') {
            return response()->json(['error' => "Loan is not ACTIVE. State: {$loan->state}"], 422);
        }
        if (now()->lte($loan->due_date)) {
            return response()->json(['error' => 'Loan is not yet overdue.', 'due_date' => $loan->due_date], 422);
        }

        try {
            $receipt     = $this->loanService->checkDefault($loan->contract_address, $user->wallet_address);
            $daysOverdue = (int)now()->diffInDays($loan->due_date);

            $loan->update(['state' => 'DEFAULTED', 'defaulted_at' => now(), 'days_overdue' => $daysOverdue]);

            if ($daysOverdue >= 90) {
                $loan->borrower->update(['blacklisted' => true]);
                Blacklist::create([
                    'user_id'         => $loan->borrower_id,
                    'wallet_address'  => $loan->borrower->wallet_address,
                    'default_loan_id' => $loan->id,
                    'days_overdue'    => $daysOverdue,
                    'reason'          => "CEMAC 2026: {$daysOverdue} days overdue on loan #{$loan->id}",
                    'on_chain_tx'     => $receipt['txHash'],
                ]);
            }

            AuditLog::create([
                'actor_id'    => $user->id,
                'actor_role'  => $user->role,
                'action'      => 'DEFAULT_DECLARED',
                'entity_type' => 'loan',
                'entity_id'   => $loan->id,
                'tx_hash'     => $receipt['txHash'],
                'details'     => ['days_overdue' => $daysOverdue],
            ]);

            return response()->json([
                'message'         => 'Default declared on-chain.',
                'tx_hash'         => $receipt['txHash'],
                'days_overdue'    => $daysOverdue,
                'cemac_blacklist' => $daysOverdue >= 90,
            ]);

        } catch (\Exception $e) {
            return response()->json(['error' => 'checkDefault failed.', 'details' => $e->getMessage()], 422);
        }
    }

    /**
     * GET /api/loans/{id}/history
     */
    public function history(Request $request, int $id): JsonResponse
    {
        $loan = Loan::with('repayments')->findOrFail($id);
        $user = $request->user();

        if ($loan->borrower_id === $user->id || in_array($user->role, ['regulator', 'admin'])) {
            return response()->json($loan->repayments);
        }

        if ($user->role === 'lender') {
            $hasConsent = LoanConsent::where('loan_id', $id)
                ->where('lender_id', $user->id)
                ->where('granted', true)
                ->exists();

            if (!$hasConsent) {
                return response()->json(['error' => 'Borrower has not granted you access.'], 403);
            }
            return response()->json($loan->repayments);
        }

        return response()->json(['error' => 'Access denied.'], 403);
    }

    /**
     * POST /api/loans/{id}/grant-access
     */
    public function grantAccess(Request $request, int $id): JsonResponse
    {
        $request->validate(['lender_wallet' => ['required', 'string']]);

        $loan = Loan::findOrFail($id);
        $user = $request->user();

        if ($loan->borrower_id !== $user->id) {
            return response()->json(['error' => 'Only the borrower can grant access.'], 403);
        }

        $lender = User::where('wallet_address', $request->input('lender_wallet'))
            ->where('role', 'lender')->firstOrFail();

        try {
            $receipt = $this->loanService->grantLenderAccess(
                $loan->contract_address, $user->wallet_address, $lender->wallet_address
            );

            LoanConsent::updateOrCreate(
                ['loan_id' => $loan->id, 'lender_id' => $lender->id],
                ['granted' => true, 'granted_at' => now(), 'tx_hash' => $receipt['txHash']]
            );

            return response()->json([
                'message' => "Access granted to {$lender->wallet_address}.",
                'tx_hash' => $receipt['txHash'],
            ]);

        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to grant access.', 'details' => $e->getMessage()], 422);
        }
    }

    /**
     * POST /api/loans/{id}/revoke-access
     */
    public function revokeAccess(Request $request, int $id): JsonResponse
    {
        $request->validate(['lender_wallet' => ['required', 'string']]);

        $loan = Loan::findOrFail($id);
        $user = $request->user();

        if ($loan->borrower_id !== $user->id) {
            return response()->json(['error' => 'Only the borrower can revoke access.'], 403);
        }

        $lender = User::where('wallet_address', $request->input('lender_wallet'))
            ->where('role', 'lender')->firstOrFail();

        try {
            $receipt = $this->loanService->revokeLenderAccess(
                $loan->contract_address, $user->wallet_address, $lender->wallet_address
            );

            LoanConsent::where('loan_id', $loan->id)
                ->where('lender_id', $lender->id)
                ->update(['granted' => false]);

            return response()->json([
                'message' => "Access revoked for {$lender->wallet_address}.",
                'tx_hash' => $receipt['txHash'],
            ]);

        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to revoke access.', 'details' => $e->getMessage()], 422);
        }
    }
}
