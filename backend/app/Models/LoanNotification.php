<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LoanNotification extends Model
{
    protected $table = 'loan_notifications';

    protected $fillable = [
        'user_id', 'loan_id', 'type', 'title', 'message',
        'read', 'read_at', 'trigger_tx_hash', 'trigger_block_number',
    ];

    protected $casts = [
        'read'    => 'boolean',
        'read_at' => 'datetime',
    ];

    public function user() { return $this->belongsTo(User::class); }
    public function loan() { return $this->belongsTo(Loan::class); }
}
