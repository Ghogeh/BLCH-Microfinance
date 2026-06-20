<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LoanFunder extends Model
{
    protected $fillable = [
        'loan_id', 'funder_id', 'amount_funded_cfa',
        'amount_funded_wei', 'tx_hash', 'block_number',
        'total_after_funding_cfa', 'funded_at',
    ];

    protected $casts = [
        'amount_funded_cfa'       => 'decimal:2',
        'total_after_funding_cfa' => 'decimal:2',
        'funded_at'               => 'datetime',
    ];

    public function loan()   { return $this->belongsTo(Loan::class); }
    public function funder() { return $this->belongsTo(User::class, 'funder_id'); }
}
