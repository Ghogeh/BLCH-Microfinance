<?php

namespace App\Http\Controllers\KYC;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\KycDocument;
use App\Models\LoanNotification;
use App\Models\User;
use App\Services\IdentityRegistryService;
use App\Services\KYCService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class KYCController extends Controller
{
    public function __construct(
        private KYCService              $kycService,
        private IdentityRegistryService $identityService,
    ) {}

    /**
     * POST /api/kyc/upload
     * Entrepreneur uploads a KYC document.
     *
     * Flow:
     * 1. Process and hash the file (off-chain)
     * 2. Call IdentityRegistry.registerIdentity() on-chain
     * 3. Update user.kyc_hash in MySQL
     * 4. Create KycDocument record
     */
    public function upload(Request $request): JsonResponse
    {
        $request->validate([
            'document' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:5120'],
            'doc_type' => ['nullable', 'in:national_id,passport,drivers_license,utility_bill,business_registration'],
        ]);

        $user = $request->user();

        if ($user->kyc_status === 'verified') {
            return response()->json([
                'error' => 'Your identity is already verified. No further uploads needed.'
            ], 422);
        }

        // Process upload and get SHA-256
        $result = $this->kycService->processUpload(
            $request->file('document'),
            $user,
            $request->input('doc_type', 'national_id')
        );

        // Register on-chain (status → Pending in IdentityRegistry)
        $receipt = $this->identityService->registerIdentity(
            $user->wallet_address,
            $result['sha256_hash'],
            strtoupper($user->role)
        );

        // Update off-chain MySQL record
        $user->update([
            'kyc_hash'   => $result['sha256_hash'],
            'kyc_status' => 'pending',
        ]);

        KycDocument::where('user_id', $user->id)->latest()->first()?->update([
            'on_chain_tx' => $receipt['txHash'],
        ]);

        AuditLog::create([
            'actor_id'    => $user->id,
            'actor_role'  => $user->role,
            'action'      => 'KYC_UPLOADED',
            'entity_type' => 'kyc_document',
            'entity_id'   => $result['kyc_document_id'],
            'tx_hash'     => $receipt['txHash'],
            'details'     => ['sha256' => $result['sha256_hash']],
        ]);

        return response()->json([
            'message'         => 'KYC document uploaded and submitted on-chain. Awaiting MFI officer review.',
            'kyc_document_id' => $result['kyc_document_id'],
            'sha256_hash'     => $result['sha256_hash'],
            'tx_hash'         => $receipt['txHash'],
            'kyc_status'      => 'pending',
        ], 201);
    }

    /**
     * GET /api/kyc/status
     * Entrepreneur checks their current KYC status.
     */
    public function status(Request $request): JsonResponse
    {
        $user = $request->user();
        $doc  = $user->latestKycDocument;

        // Cross-check off-chain status with on-chain status
        $onChainVerified = $this->identityService->isVerified($user->wallet_address);

        // If they differ, the event listener is lagging — flag it
        $syncStatus = match(true) {
            $onChainVerified && $user->kyc_status !== 'verified' => 'SYNC_LAG',
            !$onChainVerified && $user->kyc_status === 'verified' => 'MISMATCH',
            default => 'IN_SYNC',
        };

        return response()->json([
            'kyc_status'        => $user->kyc_status,
            'on_chain_verified' => $onChainVerified,
            'sync_status'       => $syncStatus,
            'kyc_hash'          => $user->kyc_hash,
            'latest_document'   => $doc ? [
                'id'               => $doc->id,
                'doc_type'         => $doc->doc_type,
                'status'           => $doc->status,
                'submitted_at'     => $doc->created_at,
                'verified_at'      => $doc->verified_at,
                'rejection_reason' => $doc->rejection_reason,
            ] : null,
        ]);
    }

    /**
     * GET /api/officer/kyc/queue
     * MFI Officer views pending KYC submissions. Officer-only.
     */
    public function queue(): JsonResponse
    {
        $pending = KycDocument::with('user')
            ->where('status', 'pending')
            ->orderBy('created_at', 'asc') // oldest first — FIFO queue
            ->paginate(20);

        return response()->json($pending);
    }

    /**
     * POST /api/officer/kyc/{userId}/verify
     * MFI Officer approves a KYC submission. Officer-only.
     */
    public function verify(Request $request, int $userId): JsonResponse
    {
        $officer = $request->user();
        $target  = User::findOrFail($userId);

        $doc = $target->latestKycDocument;
        if (!$doc || $doc->status !== 'pending') {
            return response()->json([
                'error' => 'No pending KYC document found for this user.'
            ], 422);
        }

        // Call on-chain: IdentityRegistry.verifyIdentity()
        $receipt = $this->identityService->verifyIdentity($target->wallet_address);

        // Sync MySQL
        $target->update(['kyc_status' => 'verified']);
        $doc->update([
            'status'      => 'verified',
            'verified_by' => $officer->id,
            'verified_at' => now(),
            'on_chain_tx' => $receipt['txHash'],
        ]);

        // Notify the entrepreneur
        LoanNotification::create([
            'user_id' => $target->id,
            'type'    => 'KYC_VERIFIED',
            'title'   => 'Identity Verified',
            'message' => 'Your KYC documents have been verified. You can now request loans.',
            'trigger_tx_hash' => $receipt['txHash'],
        ]);

        AuditLog::create([
            'actor_id'    => $officer->id,
            'actor_role'  => 'officer',
            'action'      => 'KYC_VERIFIED',
            'entity_type' => 'user',
            'entity_id'   => $target->id,
            'tx_hash'     => $receipt['txHash'],
            'details'     => ['verified_user' => $target->wallet_address],
        ]);

        return response()->json([
            'message'    => "Identity verified for {$target->wallet_address}",
            'tx_hash'    => $receipt['txHash'],
            'kyc_status' => 'verified',
        ]);
    }

    /**
     * POST /api/officer/kyc/{userId}/reject
     * MFI Officer rejects a KYC submission. Officer-only.
     */
    public function reject(Request $request, int $userId): JsonResponse
    {
        $request->validate([
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $officer = $request->user();
        $target  = User::findOrFail($userId);
        $reason  = $request->input('reason');

        $doc = $target->latestKycDocument;
        if (!$doc || $doc->status !== 'pending') {
            return response()->json([
                'error' => 'No pending KYC document found for this user.'
            ], 422);
        }

        $receipt = $this->identityService->rejectIdentity($target->wallet_address, $reason);

        $target->update(['kyc_status' => 'rejected']);
        $doc->update([
            'status'           => 'rejected',
            'verified_by'      => $officer->id,
            'verified_at'      => now(),
            'rejection_reason' => $reason,
            'on_chain_tx'      => $receipt['txHash'],
        ]);

        LoanNotification::create([
            'user_id' => $target->id,
            'type'    => 'KYC_REJECTED',
            'title'   => 'Identity Verification Rejected',
            'message' => "Your KYC submission was rejected: {$reason}. Please resubmit with correct documents.",
        ]);

        return response()->json([
            'message' => 'KYC submission rejected.',
            'reason'  => $reason,
            'tx_hash' => $receipt['txHash'],
        ]);
    }
}
