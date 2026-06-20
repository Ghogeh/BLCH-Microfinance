<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('repayments', function (Blueprint $table) {
            $table->id();

            $table->foreignId('loan_id')
                  ->constrained('loans')
                  ->onDelete('cascade');

            $table->foreignId('borrower_id')
                  ->constrained('users')
                  ->onDelete('restrict');

            // Column names match Repayment model $fillable exactly
            $table->decimal('amount_paid_cfa', 15, 2);
            $table->string('amount_paid_wei', 78)->nullable();

            // Balance remaining AFTER this payment
            $table->decimal('remaining_after_cfa', 15, 2)->nullable();

            // nullable — seeder rows may not yet have an on-chain tx
            $table->string('tx_hash', 66)->nullable()->unique()
                  ->comment('On-chain tx of repay() — unique per confirmed payment');

            $table->unsignedBigInteger('block_number')->nullable();

            // When the repayment was confirmed on-chain (nullable for offline/test entries)
            $table->timestamp('on_chain_timestamp')->nullable();

            // Credit score inputs
            $table->boolean('was_on_time')->default(true);
            $table->unsignedInteger('days_late')->default(0);

            // Snapshot of borrower's reputation score after this repayment
            $table->unsignedInteger('reputation_score_after')->nullable();

            $table->timestamps();

            $table->index('loan_id');
            $table->index('borrower_id');
            $table->index('on_chain_timestamp');
        });

        // Repayments are on-chain facts — they cannot be altered off-chain
        \DB::unprepared('
            CREATE TRIGGER trg_repayments_no_update
            BEFORE UPDATE ON repayments
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE "45000"
                    SET MESSAGE_TEXT = "NFR-002: repayments are immutable — on-chain transactions cannot be reversed";
            END
        ');

        \DB::unprepared('
            CREATE TRIGGER trg_repayments_no_delete
            BEFORE DELETE ON repayments
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE "45000"
                    SET MESSAGE_TEXT = "NFR-002: repayment records cannot be deleted — blockchain is the source of truth";
            END
        ');
    }

    public function down(): void
    {
        \DB::unprepared('DROP TRIGGER IF EXISTS trg_repayments_no_update');
        \DB::unprepared('DROP TRIGGER IF EXISTS trg_repayments_no_delete');
        Schema::dropIfExists('repayments');
    }
};
