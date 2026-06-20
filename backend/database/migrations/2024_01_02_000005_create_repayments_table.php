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

            // CFA equivalent of the repayment
            $table->decimal('amount_cfa', 15, 2);

            // Exact on-chain msg.value in wei — uint256 from RepaymentMade event
            $table->string('amount_wei', 78)->nullable();

            // One row per on-chain transaction — unique enforces no double-counting
            $table->string('tx_hash', 66)->unique()
                  ->comment('On-chain tx of repay() call — unique per payment');

            $table->unsignedBigInteger('block_number');

            // How many days past due_date this payment was made
            // 0 = on time, >0 = late, feeds into credit score formula
            $table->unsignedInteger('days_late')->default(0);

            // Balance remaining AFTER this payment (mirrors remainingBalance on-chain)
            $table->decimal('balance_after_cfa', 15, 2)->nullable();

            // When the repayment was confirmed on-chain
            $table->timestamp('repaid_at');

            $table->timestamps();

            $table->index('loan_id');
            $table->index('borrower_id');
            $table->index('repaid_at');
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
