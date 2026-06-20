<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loan_guarantors', function (Blueprint $table) {
            $table->id();

            $table->foreignId('loan_id')
                  ->constrained('loans')
                  ->onDelete('cascade');

            // The wallet that called provideGuarantee() on-chain
            $table->foreignId('guarantor_id')
                  ->constrained('users')
                  ->onDelete('restrict');

            // Transaction hash of the provideGuarantee() call
            $table->string('tx_hash', 66)->nullable()
                  ->comment('On-chain tx of provideGuarantee()');

            // Block number for audit trail
            $table->unsignedBigInteger('block_number')->nullable();

            // Guarantee amount in CFA (if partial stake — future feature)
            $table->decimal('stake_amount_cfa', 15, 2)->nullable();

            // When was the guarantee signed
            $table->timestamp('guaranteed_at')->nullable();

            // Status — mirrors on-chain state
            $table->enum('status', ['active', 'released', 'penalised'])
                  ->default('active');

            $table->timestamps();

            // A guarantor can only guarantee a specific loan once
            $table->unique(['loan_id', 'guarantor_id']);
            $table->index('loan_id');
            $table->index('guarantor_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loan_guarantors');
    }
};
