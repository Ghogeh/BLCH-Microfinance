<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            // Primary identifier
            $table->id();

            // Blockchain identity — the wallet address IS the user's identity
            // This links every DB record to an on-chain address
            $table->string('wallet_address', 42)->unique()
                  ->comment('Ethereum wallet address — 0x + 40 hex chars');

            // Role maps exactly to Solidity Roles.sol constants
            // and Laravel middleware role checks
            $table->enum('role', [
                'entrepreneur',  // Roles.ENTREPRENEUR
                'lender',        // Roles.LENDER
                'officer',       // Roles.MFI_OFFICER
                'regulator',     // Roles.REGULATOR
                'admin',         // Roles.ADMIN
            ])->default('entrepreneur');

            // Personal details — stored ONLY off-chain (NFR-009)
            // NEVER transmitted to the blockchain
            $table->string('name', 255)->nullable();
            $table->string('phone', 20)->nullable();
            $table->string('email', 255)->unique()->nullable();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password')->nullable()
                  ->comment('Optional — primary auth is via wallet signature');

            // KYC status — mirrors IdentityRegistry.sol KYCStatus enum
            $table->enum('kyc_status', ['pending', 'verified', 'rejected'])
                  ->default('pending');

            // SHA-256 hash of KYC document — the ONLY KYC data on-chain
            // This column mirrors what is in IdentityRegistry.sol
            $table->char('kyc_hash', 64)->nullable()
                  ->comment('SHA-256 hex hash of off-chain KYC document');

            // CEMAC 2026 blacklist flag — mirrors blacklisted mapping in IdentityRegistry
            $table->boolean('blacklisted')->default(false)
                  ->comment('True when address blacklisted on-chain per CEMAC 2026');

            // Institution for lenders and officers (e.g. "CamMFI Bamenda")
            $table->string('institution_name', 255)->nullable();

            // Timestamps
            $table->rememberToken();
            $table->timestamps();
            $table->softDeletes();

            // Indexes for frequent query patterns
            $table->index('role');
            $table->index('kyc_status');
            $table->index('blacklisted');
            $table->index(['role', 'kyc_status']);
        });

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('users');
    }
};
