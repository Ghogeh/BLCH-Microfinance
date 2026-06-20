<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_log', function (Blueprint $table) {
            $table->id();

            // Who performed the action — null means smart contract trigger
            $table->foreignId('actor_id')
                  ->nullable()
                  ->constrained('users')
                  ->onDelete('set null');

            $table->enum('actor_role', [
                'entrepreneur', 'lender', 'officer',
                'regulator', 'admin', 'contract', 'system'
            ])->nullable();

            // What was done — use SCREAMING_SNAKE_CASE constants
            // Examples: LOAN_CREATED, KYC_VERIFIED, REPAYMENT_MADE,
            //           DEFAULT_DECLARED, ADDRESS_BLACKLISTED, LENDER_ACCESS_GRANTED
            $table->string('action', 100);

            // What entity was affected
            $table->enum('entity_type', [
                'loan', 'user', 'repayment', 'guarantee',
                'funder', 'kyc_document', 'blacklist', 'system'
            ])->nullable();

            $table->unsignedBigInteger('entity_id')->nullable();

            // Blockchain references
            $table->string('contract_address', 42)->nullable();
            $table->string('tx_hash', 66)->nullable();
            $table->unsignedBigInteger('block_number')->nullable();

            // Additional context as JSON
            // Example: {"amount": 50000, "borrower": "0x123...", "new_state": "ACTIVE"}
            $table->json('details')->nullable();

            // Network metadata for security analysis
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 500)->nullable();

            $table->timestamp('created_at')->useCurrent();

            // NO updated_at — this table is append-only
            // Indexes for common audit query patterns
            $table->index('actor_id');
            $table->index('action');
            $table->index(['entity_type', 'entity_id']);
            $table->index('tx_hash');
            $table->index('created_at');
            $table->index('block_number');
        });

        // Audit log is COMPLETELY immutable — no updates, no deletes
        \DB::unprepared('
            CREATE TRIGGER trg_audit_log_no_update
            BEFORE UPDATE ON audit_log
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE "45000"
                    SET MESSAGE_TEXT = "NFR-010: audit_log is immutable — no updates permitted";
            END
        ');

        \DB::unprepared('
            CREATE TRIGGER trg_audit_log_no_delete
            BEFORE DELETE ON audit_log
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE "45000"
                    SET MESSAGE_TEXT = "NFR-010: audit_log records cannot be deleted";
            END
        ');
    }

    public function down(): void
    {
        \DB::unprepared('DROP TRIGGER IF EXISTS trg_audit_log_no_update');
        \DB::unprepared('DROP TRIGGER IF EXISTS trg_audit_log_no_delete');
        Schema::dropIfExists('audit_log');
    }
};
