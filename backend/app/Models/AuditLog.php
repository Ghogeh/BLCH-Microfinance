<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    public $timestamps = false;
    const CREATED_AT = 'created_at';

    protected $fillable = [
        'actor_id', 'actor_role', 'action',
        'entity_type', 'entity_id',
        'contract_address', 'tx_hash', 'block_number',
        'details', 'ip_address', 'user_agent',
    ];

    protected $casts = [
        'details'    => 'array',
        'created_at' => 'datetime',
    ];

    public function actor() { return $this->belongsTo(User::class, 'actor_id'); }
}
