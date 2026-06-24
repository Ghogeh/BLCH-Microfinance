<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\KYC\KYCController;
use App\Http\Controllers\Loan\LoanController;
use App\Http\Controllers\Credit\CreditController;
use App\Http\Controllers\Audit\AuditController;

// ── Wallet-based authentication (public) ──────────────────────────────────────
Route::prefix('auth')->group(function () {
    Route::get('/nonce',   [AuthController::class, 'nonce']);
    Route::post('/verify', [AuthController::class, 'verify']);
});

// ── Authenticated routes ──────────────────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout',  [AuthController::class, 'logout']);
    Route::put('/auth/register', [AuthController::class, 'register']);

    Route::get('/users/me',              [AuthController::class, 'me'])->name('users.me');
    Route::get('/users/me/credit-score', [CreditController::class, 'myScore']);

    // KYC — any authenticated user can upload; only officers can review
    Route::post('/kyc/upload', [KYCController::class, 'upload']);
    Route::get('/kyc/status',  [KYCController::class, 'status']);

    // Loans — entrepreneur role + KYC required for mutations
    Route::get('/loans',     [LoanController::class, 'index']);
    Route::get('/loans/{id}',[LoanController::class, 'show']);

    Route::middleware(['role:entrepreneur', 'kyc_verified'])->group(function () {
        Route::post('/loans',                    [LoanController::class, 'store']);
        Route::post('/loans/{id}/repay',         [LoanController::class, 'repay']);
        Route::post('/loans/{id}/grant-access',  [LoanController::class, 'grantAccess']);
        Route::post('/loans/{id}/revoke-access', [LoanController::class, 'revokeAccess']);
    });

    Route::middleware(['role:lender', 'kyc_verified'])->group(function () {
        Route::post('/loans/{id}/fund', [LoanController::class, 'fund']);
        Route::get('/loans/{id}/history', [LoanController::class, 'history']);
    });

    Route::post('/loans/{id}/guarantee',     [LoanController::class, 'guarantee'])
        ->middleware(['kyc_verified']);
    Route::post('/loans/{id}/check-default', [LoanController::class, 'checkDefault']);

    // Credit passport
    Route::get('/borrowers/{wallet}/credit-passport', [CreditController::class, 'passport'])
        ->middleware('role:lender');

    // Regulator-only audit
    Route::middleware('role:regulator')->group(function () {
        Route::get('/audit/loans',                 [AuditController::class, 'allLoans']);
        Route::get('/audit/verify-merkle/{block}', [AuditController::class, 'verifyMerkle']);
        Route::get('/audit/blacklist',             [AuditController::class, 'blacklist']);
        Route::post('/audit/penalty/{wallet}',     [AuditController::class, 'triggerPenalty']);
    });

    // Officer-only KYC management
    Route::middleware('role:officer,admin')->group(function () {
        Route::post('/officer/kyc/{userId}/verify', [KYCController::class, 'verify']);
        Route::post('/officer/kyc/{userId}/reject', [KYCController::class, 'reject']);
        Route::get('/officer/kyc/queue',            [KYCController::class, 'queue']);
    });
});
