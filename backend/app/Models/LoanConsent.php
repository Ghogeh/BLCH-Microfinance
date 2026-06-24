<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LoanConsent extends Model
{
    protected $fillable = ['loan_id', 'lender_id', 'granted', 'granted_at', 'tx_hash'];
    protected $casts    = ['granted' => 'boolean', 'granted_at' => 'datetime'];

    public function loan()   { return $this->belongsTo(Loan::class); }
    public function lender() { return $this->belongsTo(User::class, 'lender_id'); }
}
