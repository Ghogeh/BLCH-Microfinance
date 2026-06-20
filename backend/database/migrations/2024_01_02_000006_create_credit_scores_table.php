<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('credit_scores', function (Blueprint $table) {
            $table->id();

            // One record per user — updated after every repayment
            $table->foreignId('user_id')
                  ->unique()
                  ->constrained('users')
                  ->onDelete('cascade');

            // 0–100; decimal to match model cast 'decimal:2'
            $table->decimal('score', 5, 2)->default(50.00)
                  ->comment('0-100; green ≥70, amber 40-69, red <40 (US-E03)');

            // Column names match CreditScore model $fillable exactly
            $table->unsignedInteger('on_time_payments')->default(0);
            $table->unsignedInteger('total_payments')->default(0);
            $table->decimal('cumulative_volume_cfa', 15, 2)->default(0);
            $table->unsignedInteger('cumulative_days_late')->default(0);
            $table->unsignedInteger('total_loans_completed')->default(0);
            $table->unsignedInteger('total_loans_defaulted')->default(0);

            // Scoring formula weights — set by Admin, can be tuned per consortium
            $table->decimal('weight_timeliness', 5, 4)->nullable();
            $table->decimal('weight_volume', 5, 4)->nullable();
            $table->decimal('weight_lateness', 5, 4)->nullable();

            // Which repayment triggered this score update
            $table->foreignId('triggered_by_repayment_id')
                  ->nullable()
                  ->constrained('repayments')
                  ->onDelete('set null');

            // The ReputationUpdated on-chain tx
            $table->string('on_chain_tx', 66)->nullable();

            // When this score was computed
            $table->timestamp('calculated_at')->nullable();

            $table->timestamps();

            $table->index('score');
            $table->index('calculated_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('credit_scores');
    }
};
