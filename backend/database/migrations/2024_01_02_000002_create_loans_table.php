<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loans', function (Blueprint $table) {
            $table->id();

            // ── Blockchain references ─────────────────────────────────────────

            // The deployed LoanContract address for this loan
            // Null until LoanFactory.createLoan() tx is confirmed
            $table->string('contract_address', 42)->nullable()->unique()
                  ->comment('Deployed LoanContract.sol address on-chain');

            // The uint256 loan ID as stored in LoanFactory.loans mapping
            $table->unsignedBigInteger('loan_id_on_chain')->nullable()
                  ->comment('Index in LoanFactory.loans[] mapping');

            // Transaction hash that created this loan on-chain
            $table->string('created_tx_hash', 66)->nullable();

            // ── Loan parties ──────────────────────────────────────────────────

            // The entrepreneur requesting the loan
            $table->foreignId('borrower_id')
                  ->constrained('users')
                  ->onDelete('restrict')
                  ->comment('Must hold ENTREPRENEUR role and be KYC-verified');

            // Officer who approved — null if auto-approved by smart contract
            $table->foreignId('approved_by')
                  ->nullable()
                  ->constrained('users')
                  ->onDelete('set null');

            // ── Loan financial terms ──────────────────────────────────────────

            // Amount in CFA francs (off-chain unit)
            // Range: 50,000 – 500,000 CFA (dissertation §3.5 assumption)
            $table->decimal('amount_cfa', 15, 2)
                  ->comment('Loan amount in CFA francs');

            // Amount in Wei (on-chain unit) — for blockchain interactions
            $table->string('amount_wei', 78)->nullable()
                  ->comment('loanAmount in wei — uint256 from smart contract');

            // Duration in days (e.g. 30, 60, 90)
            $table->unsignedInteger('duration_days');

            // Annual interest rate in basis points (1000 = 10%)
            // Stored as integer to avoid float precision issues
            $table->unsignedInteger('interest_rate_bps')
                  ->comment('Interest in basis points: 1000 = 10%');

            // ── Loan state — mirrors LoanContract.LoanState enum ─────────────

            // OPEN:      created, awaiting guarantees
            // FUNDING:   accepting lender contributions
            // ACTIVE:    disbursed, repayment in progress
            // REPAID:    fully settled
            // DEFAULTED: missed deadline, may trigger CEMAC blacklist
            $table->enum('state', [
                'OPEN', 'FUNDING', 'ACTIVE', 'REPAID', 'DEFAULTED'
            ])->default('OPEN');

            // ── Financial tracking ────────────────────────────────────────────

            // Total contributed by all lenders so far
            $table->decimal('total_funded_cfa', 15, 2)->default(0);

            // Outstanding balance = principal + interest - repayments made
            // Null until disbursement (state transitions to ACTIVE)
            $table->decimal('remaining_balance_cfa', 15, 2)->nullable();

            // ── Key dates ─────────────────────────────────────────────────────

            // Repayment deadline — set at contract deployment
            $table->date('due_date')->nullable();

            // When the loan was disbursed (state → ACTIVE)
            $table->timestamp('disbursed_at')->nullable();

            // When the loan was fully repaid (state → REPAID)
            $table->timestamp('repaid_at')->nullable();

            // When the default was declared (state → DEFAULTED)
            $table->timestamp('defaulted_at')->nullable();

            // ── Group lending metadata ─────────────────────────────────────────

            // Minimum number of peer guarantees required (n in n-of-m)
            $table->unsignedTinyInteger('required_guarantees')->default(1);

            // Current count — mirrors guarantors[].length on-chain
            $table->unsignedTinyInteger('current_guarantees')->default(0);

            // ── Regulatory ────────────────────────────────────────────────────

            // Days overdue when default was declared
            $table->unsignedInteger('days_overdue')->nullable();

            // Whether COBAC was notified of this default
            $table->boolean('cobac_notified')->default(false);

            $table->timestamps();
            $table->softDeletes();

            // ── Indexes ───────────────────────────────────────────────────────
            $table->index('state');
            $table->index('borrower_id');
            $table->index('contract_address');
            $table->index('due_date');
            $table->index(['state', 'due_date']);
            $table->index(['borrower_id', 'state']);
        });

        // NFR-002: enforce OPEN→FUNDING→ACTIVE→REPAID/DEFAULTED — no backward transitions
        \DB::unprepared('
            CREATE TRIGGER trg_loan_state_forward_only
            BEFORE UPDATE ON loans
            FOR EACH ROW
            BEGIN
                IF NOT (
                    (OLD.state = "OPEN"      AND NEW.state IN ("OPEN","FUNDING","DEFAULTED")) OR
                    (OLD.state = "FUNDING"   AND NEW.state IN ("FUNDING","ACTIVE","DEFAULTED")) OR
                    (OLD.state = "ACTIVE"    AND NEW.state IN ("ACTIVE","REPAID","DEFAULTED")) OR
                    (OLD.state = "REPAID"    AND NEW.state = "REPAID") OR
                    (OLD.state = "DEFAULTED" AND NEW.state = "DEFAULTED")
                ) THEN
                    SIGNAL SQLSTATE "45000"
                        SET MESSAGE_TEXT = "NFR-002: illegal loan state transition";
                END IF;
            END
        ');
    }

    public function down(): void
    {
        \DB::unprepared('DROP TRIGGER IF EXISTS trg_loan_state_forward_only');
        Schema::dropIfExists('loans');
    }
};
