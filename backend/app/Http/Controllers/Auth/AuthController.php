<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * AuthController
 *
 * Handles wallet-based authentication for the EDL system.
 * No passwords. Identity is proved by signing a nonce with MetaMask.
 *
 * Flow:
 *   1. GET  /api/auth/nonce?wallet=0x...  → returns a nonce to sign
 *   2. POST /api/auth/verify              → verifies signature, returns token
 *   3. POST /api/auth/logout              → revokes token
 *   4. GET  /api/users/me                 → returns current user
 */
class AuthController extends Controller
{
    /**
     * Step 1: Issue a nonce for the wallet to sign.
     * The nonce expires in 5 minutes — single use.
     */
    public function nonce(Request $request): JsonResponse
    {
        $request->validate([
            'wallet' => ['required', 'string', 'regex:/^0x[a-fA-F0-9]{40}$/'],
        ]);

        $wallet = strtolower($request->input('wallet'));
        $nonce  = Str::random(32);

        // Store nonce — delete any previous nonce for this wallet first
        DB::table('wallet_nonces')
            ->where('wallet_address', $wallet)
            ->delete();

        DB::table('wallet_nonces')->insert([
            'wallet_address' => $wallet,
            'nonce'          => $nonce,
            'expires_at'     => now()->addMinutes(5),
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);

        $message = "EDL Microfinance: Sign this message to authenticate.\n\nNonce: {$nonce}\n\nThis request will expire in 5 minutes.";

        return response()->json([
            'nonce'   => $nonce,
            'message' => $message,
            'wallet'  => $wallet,
        ]);
    }

    /**
     * Step 2: Verify the signature and issue a Sanctum token.
     *
     * The MetaMask personal_sign prefix is:
     * "\x19Ethereum Signed Message:\n" + length + message
     *
     * We reconstruct this, hash it with Keccak-256, and recover the
     * signer's address via ECDSA. If it matches the claimed wallet,
     * authentication succeeds.
     */
    public function verify(Request $request): JsonResponse
    {
        $request->validate([
            'wallet'    => ['required', 'string', 'regex:/^0x[a-fA-F0-9]{40}$/'],
            'signature' => ['required', 'string'],
        ]);

        $wallet    = strtolower($request->input('wallet'));
        $signature = $request->input('signature');

        // Retrieve and validate nonce
        $nonceRecord = DB::table('wallet_nonces')
            ->where('wallet_address', $wallet)
            ->where('expires_at', '>', now())
            ->first();

        if (!$nonceRecord) {
            return response()->json([
                'error' => 'No valid nonce found. Request a new nonce first.'
            ], 401);
        }

        $message = "EDL Microfinance: Sign this message to authenticate.\n\nNonce: {$nonceRecord->nonce}\n\nThis request will expire in 5 minutes.";

        // Verify signature using ecrecover
        $recovered = $this->recoverAddress($message, $signature);

        if (strtolower($recovered) !== $wallet) {
            return response()->json([
                'error' => 'Signature verification failed. Recovered address does not match.'
            ], 401);
        }

        // Consume nonce (single-use: delete it immediately)
        DB::table('wallet_nonces')
            ->where('wallet_address', $wallet)
            ->delete();

        // Find or create user
        $user = User::firstOrCreate(
            ['wallet_address' => $wallet],
            [
                'role'       => 'entrepreneur', // default role
                'kyc_status' => 'pending',
            ]
        );

        // Revoke all previous tokens and issue a fresh one
        $user->tokens()->delete();
        $token = $user->createToken('edl-auth-token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user'  => [
                'id'             => $user->id,
                'wallet_address' => $user->wallet_address,
                'role'           => $user->role,
                'name'           => $user->name,
                'kyc_status'     => $user->kyc_status,
                'blacklisted'    => $user->blacklisted,
            ],
        ]);
    }

    /**
     * Register a new user profile (called after first successful verify).
     * Separate from verify so users can update profile without re-signing.
     */
    public function register(Request $request): JsonResponse
    {
        $request->validate([
            'name'             => ['required', 'string', 'max:255'],
            'phone'            => ['nullable', 'string', 'max:20'],
            'email'            => ['nullable', 'email', 'unique:users,email'],
            'role'             => ['required', 'in:entrepreneur,lender,officer'],
            'institution_name' => ['nullable', 'string', 'max:255'],
        ]);

        $user = $request->user();
        $user->update($request->only([
            'name', 'phone', 'email', 'role', 'institution_name'
        ]));

        return response()->json(['user' => $user->fresh()]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out successfully']);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load(['creditScore', 'latestKycDocument']);
        return response()->json(['user' => $user]);
    }

    // ── Private: Ethereum signature recovery ──────────────────────────────────

    /**
     * Recover the Ethereum address from a personal_sign signature.
     *
     * MetaMask prepends "\x19Ethereum Signed Message:\n{length}" to the
     * message before signing. We must reproduce this prefix and hash with
     * Keccak-256 (not SHA3-256) before recovering the public key via ECDSA.
     */
    private function recoverAddress(string $message, string $signature): string
    {
        try {
            // Reproduce the MetaMask personal_sign prefix
            $prefixed = "\x19Ethereum Signed Message:\n" . strlen($message) . $message;

            // Hash with Keccak-256 — the keccak256() helper from CryptoHelpers.php
            $msgHash = keccak256($prefixed); // returns 64-char hex string

            // Parse r, s, v from the 65-byte signature (130 hex chars + 0x prefix)
            $sig      = ltrim($signature, '0x');
            $r        = substr($sig, 0,   64);
            $s        = substr($sig, 64,  64);
            $v        = hexdec(substr($sig, 128, 2));
            if ($v < 27) $v += 27;
            $recovery = $v - 27; // 0 or 1

            // ECDSA public key recovery on secp256k1
            $ec        = new \Elliptic\EC('secp256k1');
            $publicKey = $ec->recoverPubKey($msgHash, ['r' => $r, 's' => $s], $recovery);

            // Uncompressed public key: 04 + X(32 bytes) + Y(32 bytes) = 65 bytes
            // Ethereum address = last 20 bytes of Keccak-256(X || Y)
            $pubKeyHex  = $publicKey->encode('hex');         // 130 hex chars (with 04 prefix)
            $pubKeyHash = keccak256(hex2bin(substr($pubKeyHex, 2))); // skip '04', hash XY

            return '0x' . substr($pubKeyHash, -40); // last 20 bytes = 40 hex chars

        } catch (\Throwable $e) {
            Log::error('ecrecover failed', ['error' => $e->getMessage()]);
            return '0x0000000000000000000000000000000000000000';
        }
    }
}
