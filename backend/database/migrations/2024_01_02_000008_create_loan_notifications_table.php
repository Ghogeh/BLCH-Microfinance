<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // NOTE: We use loan_notifications instead of Laravel's default
        // notifications table to avoid conflicts and add loan-specific fields
        Schema::create('loan_notifications', function (Blueprint $table) {
            $table->id();

            $table->foreignId('user_id')
                  ->constrained('users')
                  ->onDelete('cascade');

            $table->foreignId('loan_id')
                  ->nullable()
                  ->constrained('loans')
                  ->onDelete('set null');

            $table->enum('type', [
                'LOAN_CREATED',
                'GUARANTEE_REQUESTED',
                'GUARANTEE_PROVIDED',
                'LOAN_FUNDED',
                'LOAN_DISBURSED',
                'REPAYMENT_DUE',
                'REPAYMENT_RECEIVED',
                'DEFAULT_WARNING',
                'DEFAULT_DECLARED',
                'KYC_VERIFIED',
                'KYC_REJECTED',
                'ADDRESS_BLACKLISTED',
                'LENDER_ACCESS_GRANTED',
                'REGULATORY_PENALTY'
            ]);

            $table->string('title', 255);
            $table->text('message');
            $table->boolean('read')->default(false);
            $table->timestamp('read_at')->nullable();

            // On-chain event that triggered this notification
            $table->string('trigger_tx_hash', 66)->nullable();
            $table->unsignedBigInteger('trigger_block_number')->nullable();

            $table->timestamps();

            $table->index(['user_id', 'read']);
            $table->index(['user_id', 'created_at']);
            $table->index('type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loan_notifications');
    }
};
