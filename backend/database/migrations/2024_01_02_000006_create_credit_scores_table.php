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

            // One credit score record per user — updated after every repayment
            $table->foreignId('user_id')
                  ->unique()
                  ->constrained('users')
                  ->onDelete('cascade');

            // 0–100 score — mirrors ReputationUpdated event from LoanContract.sol
            $table->unsignedTinyInteger('score')->default(50)
                  ->comment('0-100; green ≥70, amber 40-69, red <40 (US-E03)');

            // Component counters used in on-chain scoring formula
            $table->unsignedInteger('on_time_count')->default(0);
            $table->unsignedInteger('late_count')->default(0);
            $table->unsignedInteger('default_count')->default(0);

            // Total CFA repaid across all loans — for volume-based scoring
            $table->decimal('total_volume_cfa', 15, 2)->default(0);

            // Which block last updated this score — used to detect stale mirrors
            $table->unsignedBigInteger('last_updated_block')->default(0);

            // The on-chain tx that triggered the latest score update
            $table->string('last_update_tx', 66)->nullable();

            $table->timestamps();

            $table->index('score');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('credit_scores');
    }
};
