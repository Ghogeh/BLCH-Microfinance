<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, SoftDeletes;

    protected $fillable = [
        'wallet_address', 'role', 'name', 'phone', 'email',
        'password', 'kyc_status', 'kyc_hash', 'blacklisted',
        'institution_name',
    ];

    protected $hidden = ['password', 'remember_token'];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'blacklisted'       => 'boolean',
        'password'          => 'hashed',
    ];

    // ── Role helpers ──────────────────────────────────────────────────────────

    public function isEntrepreneur(): bool  { return $this->role === 'entrepreneur'; }
    public function isLender(): bool        { return $this->role === 'lender'; }
    public function isOfficer(): bool       { return $this->role === 'officer'; }
    public function isRegulator(): bool     { return $this->role === 'regulator'; }
    public function isAdmin(): bool         { return $this->role === 'admin'; }
    public function isKYCVerified(): bool   { return $this->kyc_status === 'verified'; }
    public function isEligibleToBorrow(): bool {
        return $this->isKYCVerified() && !$this->blacklisted;
    }

    // ── Relationships ─────────────────────────────────────────────────────────

    public function loans()
    {
        return $this->hasMany(Loan::class, 'borrower_id');
    }

    public function guaranteedLoans()
    {
        return $this->hasMany(LoanGuarantor::class, 'guarantor_id');
    }

    public function fundedLoans()
    {
        return $this->hasMany(LoanFunder::class, 'funder_id');
    }

    public function repayments()
    {
        return $this->hasMany(Repayment::class, 'borrower_id');
    }

    public function creditScore()
    {
        return $this->hasOne(CreditScore::class)->latestOfMany('calculated_at');
    }

    public function creditScoreHistory()
    {
        return $this->hasMany(CreditScore::class)->orderByDesc('calculated_at');
    }

    public function kycDocuments()
    {
        return $this->hasMany(KycDocument::class);
    }

    public function latestKycDocument()
    {
        return $this->hasOne(KycDocument::class)->latestOfMany();
    }

    public function notifications()
    {
        return $this->hasMany(LoanNotification::class)->orderByDesc('created_at');
    }

    public function unreadNotifications()
    {
        return $this->hasMany(LoanNotification::class)->where('read', false);
    }

    public function blacklistEntry()
    {
        return $this->hasOne(Blacklist::class);
    }

    public function auditLogs()
    {
        return $this->hasMany(AuditLog::class, 'actor_id');
    }
}
