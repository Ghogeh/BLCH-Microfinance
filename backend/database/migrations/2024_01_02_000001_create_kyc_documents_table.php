<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kyc_documents', function (Blueprint $table) {
            $table->id();

            // Which user submitted this document
            $table->foreignId('user_id')
                  ->constrained('users')
                  ->onDelete('cascade');

            // Document classification
            $table->enum('doc_type', [
                'national_id',
                'passport',
                'drivers_license',
                'utility_bill',
                'business_registration',
                'other'
            ])->default('national_id');

            // Off-chain storage path — AES-256 encrypted file
            // Path format: kyc_documents/{user_id}/{timestamp}_{filename}
            // NEVER store raw document content in DB (NFR-009)
            $table->string('file_path', 500)
                  ->comment('Encrypted file path — relative to storage/app/');

            // SHA-256 of the raw document bytes
            // This is what gets committed to IdentityRegistry.sol on-chain
            $table->char('sha256_hash', 64)
                  ->comment('SHA-256 hex — matches on-chain kycHash in IdentityRegistry');

            // MIME type for file validation on retrieval
            $table->string('mime_type', 50)->default('application/pdf');

            // File size in bytes — for storage monitoring
            $table->unsignedBigInteger('file_size_bytes')->nullable();

            // Status mirrors IdentityRegistry.sol KYCStatus enum
            $table->enum('status', ['pending', 'verified', 'rejected'])
                  ->default('pending');

            // Who verified/rejected this document — immutable audit record
            $table->foreignId('verified_by')
                  ->nullable()
                  ->constrained('users')
                  ->onDelete('set null')
                  ->comment('MFI officer who called verifyIdentity()');

            // When the officer acted on this document
            $table->timestamp('verified_at')->nullable();

            // Rejection reason — sent back to entrepreneur
            $table->string('rejection_reason', 500)->nullable();

            // Blockchain reference — tx where hash was committed
            $table->string('on_chain_tx', 66)->nullable()
                  ->comment('tx_hash of registerIdentity() transaction');

            $table->timestamps();

            // Indexes
            $table->index('user_id');
            $table->index('status');
            $table->index('sha256_hash');
            $table->index(['user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kyc_documents');
    }
};
