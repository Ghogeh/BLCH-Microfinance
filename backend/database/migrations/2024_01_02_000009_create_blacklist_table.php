<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('blacklist', function (Blueprint $table) {
            $table->id();

            // The blacklisted entrepreneur — UNIQUE because a user can only
            // be on the blacklist once
            $table->foreignId('user_id')
                  ->unique()
                  ->constrained('users')
                  ->onDelete('restrict');

            // Their wallet address — denormalized for fast lookups
            $table->string('wallet_address', 42)->unique();

            // Which loan caused the blacklisting
            $table->foreignId('default_loan_id')
                  ->nullable()
                  ->constrained('loans')
                  ->onDelete('set null');

            // How many days overdue when checkDefault() was called
            $table->unsignedInteger('days_overdue');

            // Human-readable reason — matches string passed to blacklistAddress()
            $table->string('reason', 500);

            // When blacklisted in the off-chain DB
            $table->timestamp('blacklisted_at')->useCurrent();

            // On-chain transaction that emitted AddressBlacklisted event
            $table->string('on_chain_tx', 66)->nullable();
            $table->unsignedBigInteger('on_chain_block')->nullable();

            // Whether COBAC has been formally notified (NFR-006)
            $table->boolean('cobac_notified')->default(false);
            $table->timestamp('cobac_notified_at')->nullable();

            // Can the blacklist be lifted? (administrative review)
            $table->boolean('lifted')->default(false);
            $table->timestamp('lifted_at')->nullable();
            $table->string('lifted_reason', 500)->nullable();
            $table->foreignId('lifted_by')
                  ->nullable()
                  ->constrained('users')
                  ->onDelete('set null');

            $table->timestamps();

            $table->index('wallet_address');
            $table->index('cobac_notified');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('blacklist');
    }
};
