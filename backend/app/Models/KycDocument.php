<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class KycDocument extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id', 'doc_type', 'file_path', 'sha256_hash',
        'mime_type', 'file_size_bytes', 'status',
        'verified_by', 'verified_at', 'rejection_reason', 'on_chain_tx',
    ];

    protected $hidden = ['file_path'];

    protected $casts = ['verified_at' => 'datetime'];

    public function user()       { return $this->belongsTo(User::class); }
    public function verifiedBy() { return $this->belongsTo(User::class, 'verified_by'); }

    public function isPending():  bool { return $this->status === 'pending'; }
    public function isVerified(): bool { return $this->status === 'verified'; }
    public function isRejected(): bool { return $this->status === 'rejected'; }
}
