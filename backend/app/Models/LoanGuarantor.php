<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LoanGuarantor extends Model
{
    protected $fillable = [
        'loan_id', 'guarantor_id', 'tx_hash',
        'block_number', 'stake_amount_cfa', 'guaranteed_at', 'status',
    ];

    protected $casts = ['guaranteed_at' => 'datetime'];

    public function loan()      { return $this->belongsTo(Loan::class); }
    public function guarantor() { return $this->belongsTo(User::class, 'guarantor_id'); }
}
