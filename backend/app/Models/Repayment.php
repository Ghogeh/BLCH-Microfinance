<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Repayment extends Model
{
    use HasFactory;

    // Repayments are append-only — no softDeletes, no mass updates
    protected $fillable = [
        'loan_id', 'borrower_id',
        'amount_paid_cfa', 'amount_paid_wei',
        'remaining_after_cfa',
        'tx_hash', 'block_number', 'on_chain_timestamp',
        'was_on_time', 'days_late', 'reputation_score_after',
    ];

    protected $casts = [
        'on_chain_timestamp'   => 'datetime',
        'was_on_time'          => 'boolean',
        'amount_paid_cfa'      => 'decimal:2',
        'remaining_after_cfa'  => 'decimal:2',
    ];

    public function loan()     { return $this->belongsTo(Loan::class); }
    public function borrower() { return $this->belongsTo(User::class, 'borrower_id'); }
}
