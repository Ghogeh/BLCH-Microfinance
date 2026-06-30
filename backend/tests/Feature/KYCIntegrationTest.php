<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\KycDocument;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class KYCIntegrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_kyc_status_requires_authentication(): void
    {
        $this->getJson('/api/kyc/status')->assertStatus(401);
    }

    public function test_kyc_upload_requires_authentication(): void
    {
        $this->postJson('/api/kyc/upload', [])->assertStatus(401);
    }

    public function test_kyc_upload_validates_file_type(): void
    {
        $user = User::factory()->create([
            'wallet_address' => '0x' . str_repeat('a', 40),
            'kyc_status'     => 'pending',
        ]);

        Storage::fake('local');

        $response = $this->actingAs($user)
            ->postJson('/api/kyc/upload', [
                'document' => UploadedFile::fake()->create('test.exe', 100),
                'doc_type' => 'national_id',
            ]);

        $response->assertStatus(422);
    }

    public function test_kyc_status_endpoint_returns_sync_status(): void
    {
        $user = User::factory()->create([
            'wallet_address' => '0x' . str_repeat('b', 40),
            'kyc_status'     => 'pending',
        ]);

        $response = $this->actingAs($user)->getJson('/api/kyc/status');

        $response->assertStatus(200)
                 ->assertJsonStructure([
                     'kyc_status',
                     'on_chain_verified',
                     'sync_status',
                 ]);
    }

    public function test_kyc_queue_requires_officer_role(): void
    {
        $entrepreneur = User::factory()->create([
            'wallet_address' => '0x' . str_repeat('c', 40),
            'role'           => 'entrepreneur',
        ]);

        $this->actingAs($entrepreneur)
            ->getJson('/api/officer/kyc/queue')
            ->assertStatus(403);
    }

    public function test_officer_can_access_kyc_queue(): void
    {
        $officer = User::factory()->officer()->create([
            'wallet_address' => '0x' . str_repeat('d', 40),
        ]);

        $this->actingAs($officer)
            ->getJson('/api/officer/kyc/queue')
            ->assertStatus(200)
            ->assertJsonStructure(['data', 'current_page', 'total']);
    }
}
