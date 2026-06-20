<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── NFR-002: Hash integrity verification ──────────────────────────────
        Schema::create('hash_integrity_log', function (Blueprint $table) {
            $table->id();
            $table->enum('entity_type', [
                'loan', 'repayment', 'kyc_document', 'identity'
            ]);
            $table->unsignedBigInteger('entity_id');
            $table->char('sha256_hash', 64)->comment('Expected hash from DB');
            $table->string('tx_hash', 66)->comment('On-chain tx that wrote this hash');
            $table->unsignedBigInteger('block_number');
            $table->timestamp('recorded_at')->useCurrent();
            $table->timestamp('verified_at')->nullable();
            $table->enum('verification_status', [
                'pending', 'match', 'mismatch'
            ])->default('pending');
            $table->unique(['entity_type', 'entity_id']);
            $table->index('verification_status');
        });

        // ── NFR-010: Merkle root cache for fast regulatory verification ────────
        Schema::create('merkle_root_cache', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('block_number')->unique();
            $table->string('merkle_root', 66)
                  ->comment('0x-prefixed keccak256 of block transactions');
            $table->string('verified_by_wallet', 42)->nullable()
                  ->comment('Regulator wallet that ran the verification');
            $table->boolean('chain_match')->default(true)
                  ->comment('False = tamper detected');
            $table->timestamp('verified_at')->useCurrent();
            $table->index('chain_match');
            $table->index('block_number');
        });

        // ── NFR-004 + NFR-008: Transaction latency and TPS tracking ───────────
        Schema::create('transaction_performance_log', function (Blueprint $table) {
            $table->id();
            $table->string('tx_hash', 66)->unique();
            $table->enum('operation', [
                'createLoan', 'fund', 'disburse', 'repay',
                'checkDefault', 'provideGuarantee', 'registerIdentity',
                'verifyIdentity', 'blacklistAddress'
            ]);
            $table->foreignId('initiated_by')
                  ->nullable()
                  ->constrained('users')
                  ->onDelete('set null');
            // Microsecond precision for accurate latency measurement
            $table->timestamp('submitted_at', 6)->nullable();
            $table->timestamp('confirmed_at', 6)->nullable();
            // Computed: milliseconds from submission to confirmation
            $table->unsignedInteger('latency_ms')->nullable();
            $table->unsignedBigInteger('block_number')->nullable();
            $table->enum('network', [
                'ganache', 'sepolia', 'besu_local', 'besu_prod'
            ])->default('ganache');
            $table->unsignedBigInteger('gas_used')->nullable();
            $table->decimal('gas_price_gwei', 12, 6)->nullable();
            $table->boolean('nfr004_compliant')->nullable()
                  ->comment('True if latency_ms < 5000');
            $table->timestamps();
            $table->index(['operation', 'network']);
            $table->index('confirmed_at');
        });

        // ── NFR-009: Privacy pre-flight audit log ─────────────────────────────
        Schema::create('privacy_audit_log', function (Blueprint $table) {
            $table->id();
            // First 500 chars of the payload being checked
            $table->text('payload_preview')->nullable();
            $table->foreignId('checked_by')
                  ->nullable()
                  ->constrained('users')
                  ->onDelete('set null');
            $table->timestamp('checked_at')->useCurrent();
            $table->enum('outcome', ['pending', 'PASSED', 'BLOCKED'])
                  ->default('pending');
            $table->string('violation_detail', 500)->nullable();
            $table->index('outcome');
            $table->index('checked_at');
        });

        // ── NFR-003: Node availability monitoring ─────────────────────────────
        Schema::create('node_health_log', function (Blueprint $table) {
            $table->id();
            $table->string('node_address', 42)->comment('Ethereum address of the node');
            $table->enum('node_role', [
                'mfi', 'sacco', 'regulator', 'orderer'
            ]);
            $table->string('institution_name', 255)->nullable();
            $table->enum('status', ['online', 'offline', 'degraded'])
                  ->default('online');
            $table->unsignedBigInteger('block_height')->nullable();
            $table->unsignedTinyInteger('peer_count')->nullable();
            $table->unsignedInteger('response_time_ms')->nullable();
            $table->timestamp('checked_at')->useCurrent();
            $table->index(['node_address', 'checked_at']);
            $table->index('status');
        });

        // ── NFR-007: Gas cost tracking per MFI institution ────────────────────
        Schema::create('gas_cost_log', function (Blueprint $table) {
            $table->id();
            $table->string('tx_hash', 66)->unique();
            $table->string('operation', 50);
            $table->foreignId('mfi_id')
                  ->nullable()
                  ->constrained('users')
                  ->onDelete('set null');
            $table->unsignedBigInteger('gas_used');
            $table->decimal('gas_price_gwei', 12, 6);
            // cost_eth = gas_used * gas_price_gwei / 1e9
            $table->decimal('cost_eth', 18, 8)->nullable();
            // Filled by event listener using live exchange rate
            $table->decimal('cost_usd', 10, 4)->nullable();
            $table->enum('network', ['ganache', 'besu_prod'])->default('ganache');
            $table->boolean('nfr007_compliant')->nullable()
                  ->comment('True if monthly MFI total < USD 50');
            $table->timestamp('logged_at')->useCurrent();
            $table->index(['mfi_id', 'logged_at']);
            $table->index('network');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gas_cost_log');
        Schema::dropIfExists('node_health_log');
        Schema::dropIfExists('privacy_audit_log');
        Schema::dropIfExists('transaction_performance_log');
        Schema::dropIfExists('merkle_root_cache');
        Schema::dropIfExists('hash_integrity_log');
    }
};
