<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('wallet_nonces', function (Blueprint $table) {
            $table->id();
            $table->string('wallet_address', 42)->index();
            $table->string('nonce', 100);
            $table->timestamp('expires_at');
            $table->timestamps();
        });
    }
    public function down(): void {
        Schema::dropIfExists('wallet_nonces');
    }
};
