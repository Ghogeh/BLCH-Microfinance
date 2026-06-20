<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Blacklist extends Model
{
    protected $table = 'blacklist'; // override: Laravel would guess 'blacklists'

    protected $fillable = [
        'user_id', 'wallet_address', 'default_loan_id',
        'days_overdue', 'reason', 'blacklisted_at',
        'on_chain_tx', 'on_chain_block',
        'cobac_notified', 'cobac_notified_at',
        'lifted', 'lifted_at', 'lifted_reason', 'lifted_by',
    ];

    protected $casts = [
        'blacklisted_at'    => 'datetime',
        'cobac_notified_at' => 'datetime',
        'lifted_at'         => 'datetime',
        'cobac_notified'    => 'boolean',
        'lifted'            => 'boolean',
    ];

    public function user()        { return $this->belongsTo(User::class); }
    public function defaultLoan() { return $this->belongsTo(Loan::class, 'default_loan_id'); }
    public function liftedBy()    { return $this->belongsTo(User::class, 'lifted_by'); }
}
