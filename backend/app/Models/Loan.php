<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Loan extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'contract_address', 'loan_id_on_chain', 'created_tx_hash',
        'borrower_id', 'approved_by',
        'amount_cfa', 'amount_wei', 'duration_days', 'interest_rate_bps',
        'state', 'total_funded_cfa', 'remaining_balance_cfa',
        'due_date', 'disbursed_at', 'repaid_at', 'defaulted_at',
        'required_guarantees', 'current_guarantees',
        'days_overdue', 'cobac_notified',
    ];

    protected $casts = [
        'due_date'      => 'date',
        'disbursed_at'  => 'datetime',
        'repaid_at'     => 'datetime',
        'defaulted_at'  => 'datetime',
        'cobac_notified'=> 'boolean',
        'amount_cfa'    => 'decimal:2',
        'total_funded_cfa'    => 'decimal:2',
        'remaining_balance_cfa' => 'decimal:2',
    ];

    // ── State helpers ─────────────────────────────────────────────────────────

    public function isOpen(): bool      { return $this->state === 'OPEN'; }
    public function isFunding(): bool   { return $this->state === 'FUNDING'; }
    public function isActive(): bool    { return $this->state === 'ACTIVE'; }
    public function isRepaid(): bool    { return $this->state === 'REPAID'; }
    public function isDefaulted(): bool { return $this->state === 'DEFAULTED'; }
    public function isFullyFunded(): bool {
        return $this->total_funded_cfa >= $this->amount_cfa;
    }

    public function fundingProgressPercent(): float {
        if ($this->amount_cfa == 0) return 0;
        return min(100, ($this->total_funded_cfa / $this->amount_cfa) * 100);
    }

    // ── Relationships ─────────────────────────────────────────────────────────

    public function borrower()
    {
        return $this->belongsTo(User::class, 'borrower_id');
    }

    public function approvedBy()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function guarantors()
    {
        return $this->hasMany(LoanGuarantor::class);
    }

    public function funders()
    {
        return $this->hasMany(LoanFunder::class);
    }

    public function repayments()
    {
        return $this->hasMany(Repayment::class)->orderBy('created_at');
    }

    public function notifications()
    {
        return $this->hasMany(LoanNotification::class);
    }

    public function blacklistEntry()
    {
        return $this->hasOne(Blacklist::class, 'default_loan_id');
    }

    public function auditLogs()
    {
        return $this->hasMany(AuditLog::class, 'entity_id')
                    ->where('entity_type', 'loan')
                    ->orderByDesc('created_at');
    }

    // ── Scopes for common queries ─────────────────────────────────────────────

    public function scopeActive($query)      { return $query->where('state', 'ACTIVE'); }
    public function scopeFunding($query)     { return $query->where('state', 'FUNDING'); }
    public function scopeDefaulted($query)   { return $query->where('state', 'DEFAULTED'); }
    public function scopeOverdue($query) {
        return $query->where('state', 'ACTIVE')
                     ->where('due_date', '<', now());
    }
}
