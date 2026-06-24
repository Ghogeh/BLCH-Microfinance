<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * KYCVerified Middleware
 *
 * Blocks endpoints that require KYC verification from users
 * whose kyc_status is not 'verified'.
 *
 * Applied to loan creation, funding, and repayment endpoints.
 * NOT applied to registration and KYC upload (which happen before verification).
 */
class KYCVerified
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['error' => 'Unauthenticated.'], 401);
        }

        if ($user->kyc_status !== 'verified') {
            return response()->json([
                'error'      => 'KYC verification required before this action.',
                'kyc_status' => $user->kyc_status,
                'action'     => 'Please upload your KYC documents and await MFI officer verification.',
            ], 403);
        }

        return $next($request);
    }
}
