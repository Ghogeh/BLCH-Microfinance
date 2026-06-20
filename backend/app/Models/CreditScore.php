<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CreditScore extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id', 'score',
        'on_time_payments', 'total_payments',
        'cumulative_volume_cfa', 'cumulative_days_late',
        'total_loans_completed', 'total_loans_defaulted',
        'weight_timeliness', 'weight_volume', 'weight_lateness',
        'triggered_by_repayment_id', 'on_chain_tx', 'calculated_at',
    ];

    protected $casts = [
        'score'                 => 'decimal:2',
        'cumulative_volume_cfa' => 'decimal:2',
        'calculated_at'         => 'datetime',
    ];

    public function user() { return $this->belongsTo(User::class); }
    public function repayment() {
        return $this->belongsTo(Repayment::class, 'triggered_by_repayment_id');
    }

    public function getRating(): string {
        if ($this->score >= 70) return 'GOOD';
        if ($this->score >= 40) return 'FAIR';
        return 'POOR';
    }
}
