<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\KYC\KYCController;
use App\Http\Controllers\Loan\LoanController;
use App\Http\Controllers\Credit\CreditController;
use App\Http\Controllers\Audit\AuditController;

// Public routes
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login',    [AuthController::class, 'login']);

// Authenticated routes
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/users/me', [AuthController::class, 'me']);
    Route::get('/users/me/credit-score', [CreditController::class, 'myScore']);

    // KYC
    Route::post('/kyc/upload', [KYCController::class, 'upload']);
    Route::get('/kyc/status',  [KYCController::class, 'status']);

    // Loans
    Route::get('/loans',               [LoanController::class, 'index']);
    Route::post('/loans',              [LoanController::class, 'store']);
    Route::get('/loans/{id}',          [LoanController::class, 'show']);
    Route::post('/loans/{id}/fund',    [LoanController::class, 'fund']);
    Route::post('/loans/{id}/repay',   [LoanController::class, 'repay']);
    Route::post('/loans/{id}/guarantee', [LoanController::class, 'guarantee']);
    Route::post('/loans/{id}/check-default', [LoanController::class, 'checkDefault']);
    Route::get('/loans/{id}/history',  [LoanController::class, 'history']);
    Route::post('/loans/{id}/grant-access', [LoanController::class, 'grantAccess']);
    Route::post('/loans/{id}/revoke-access', [LoanController::class, 'revokeAccess']);

    // Credit passport
    Route::get('/borrowers/{wallet}/credit-passport', [CreditController::class, 'passport']);

    // Regulator-only
    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/audit/loans',               [AuditController::class, 'allLoans']);
        Route::get('/audit/verify-merkle/{block}', [AuditController::class, 'verifyMerkle']);
        Route::get('/audit/blacklist',           [AuditController::class, 'blacklist']);
        Route::post('/audit/penalty/{wallet}',   [AuditController::class, 'triggerPenalty']);
    });

    // Officer-only KYC management
    Route::post('/officer/kyc/{userId}/verify', [KYCController::class, 'verify']);
    Route::post('/officer/kyc/{userId}/reject', [KYCController::class, 'reject']);
    Route::get('/officer/kyc/queue',            [KYCController::class, 'queue']);
});
