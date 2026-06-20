<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loan_funders', function (Blueprint $table) {
            $table->id();

            $table->foreignId('loan_id')
                  ->constrained('loans')
                  ->onDelete('cascade');

            // The lender wallet that called fund() on-chain
            $table->foreignId('funder_id')
                  ->constrained('users')
                  ->onDelete('restrict');

            // How much this specific lender contributed (CFA equivalent)
            $table->decimal('amount_funded_cfa', 15, 2);

            // Wei value — exact on-chain amount sent in msg.value
            $table->string('amount_funded_wei', 78)->nullable();

            // Transaction hash of fund() call
            $table->string('tx_hash', 66)->nullable()
                  ->comment('On-chain tx of fund() call');

            $table->unsignedBigInteger('block_number')->nullable();

            // Running total AFTER this contribution
            // Useful for calculating when threshold was crossed
            $table->decimal('total_after_funding_cfa', 15, 2)->nullable();

            $table->timestamp('funded_at')->nullable();

            $table->timestamps();

            // A lender CAN fund the same loan multiple times
            // so NO unique constraint on (loan_id, funder_id)
            $table->index(['loan_id', 'funder_id']);
            $table->index('funder_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loan_funders');
    }
};
