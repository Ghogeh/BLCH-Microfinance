<?php

namespace App\Services;

use App\Models\KycDocument;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * KYCService
 *
 * Handles off-chain KYC document processing.
 * Core responsibility: compute SHA-256 of the raw document bytes
 * and ensure it matches exactly what gets committed on-chain.
 *
 * Rule (NFR-009): Raw document bytes NEVER leave this service.
 * Only the SHA-256 hash is passed to IdentityRegistryService.
 */
class KYCService
{
    /**
     * Process a KYC document upload:
     * 1. Compute SHA-256 of raw bytes (before encryption)
     * 2. Encrypt the file and store off-chain
     * 3. Create KycDocument DB record
     * Returns the SHA-256 hex string (64 chars) for on-chain commit.
     */
    public function processUpload(
        UploadedFile $file,
        User $user,
        string $docType = 'national_id'
    ): array {
        // Read raw bytes FIRST — before any encoding or encryption
        $rawBytes = file_get_contents($file->path());

        // SHA-256 of the raw bytes — this is what goes on-chain
        // Must match: hash('sha256', file_get_contents($path))
        $sha256Hex = hash('sha256', $rawBytes);

        // Encrypt and store off-chain
        // storage/app/kyc_documents/{user_id}/{timestamp}_{original_name}
        $directory = "kyc_documents/{$user->id}";
        $filename  = time() . '_' . $file->getClientOriginalName();
        $filePath  = "{$directory}/{$filename}";

        // Store encrypted — Laravel uses AES-256-CBC with APP_KEY
        Storage::put($filePath, encrypt($rawBytes));

        // Create the off-chain record
        $doc = KycDocument::create([
            'user_id'         => $user->id,
            'doc_type'        => $docType,
            'file_path'       => $filePath,
            'sha256_hash'     => $sha256Hex,
            'mime_type'       => $file->getMimeType(),
            'file_size_bytes' => $file->getSize(),
            'status'          => 'pending',
        ]);

        return [
            'kyc_document_id' => $doc->id,
            'sha256_hash'     => $sha256Hex,
            'sha256_bytes32'  => '0x' . $sha256Hex, // format for Solidity bytes32
        ];
    }

    /**
     * Verify the integrity of a stored document.
     * Re-reads encrypted file, decrypts, re-hashes, compares to stored hash.
     * Used by the audit portal to verify no tampering occurred.
     */
    public function verifyIntegrity(KycDocument $doc): bool
    {
        if (!Storage::exists($doc->file_path)) {
            return false;
        }

        $encryptedBytes = Storage::get($doc->file_path);
        try {
            $rawBytes   = decrypt($encryptedBytes);
            $recomputed = hash('sha256', $rawBytes);
            return hash_equals($recomputed, $doc->sha256_hash);
        } catch (\Throwable) {
            return false;
        }
    }
}
