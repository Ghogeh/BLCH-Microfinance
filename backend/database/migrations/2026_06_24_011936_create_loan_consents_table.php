<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('loan_consents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('loan_id')->constrained()->onDelete('cascade');
            $table->foreignId('lender_id')->constrained('users')->onDelete('cascade');
            $table->boolean('granted')->default(true);
            $table->timestamp('granted_at')->nullable();
            $table->string('tx_hash', 66)->nullable();
            $table->timestamps();
            $table->unique(['loan_id', 'lender_id']);
        });
    }
    public function down(): void {
        Schema::dropIfExists('loan_consents');
    }
};
