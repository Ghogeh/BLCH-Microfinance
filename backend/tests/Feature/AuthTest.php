<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    // ── Nonce endpoint ────────────────────────────────────────────────────────

    public function test_nonce_endpoint_returns_signable_message()
    {
        $wallet = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

        $response = $this->getJson("/api/auth/nonce?wallet={$wallet}");

        $response->assertStatus(200)
                 ->assertJsonStructure(['nonce', 'message', 'wallet'])
                 ->assertJsonFragment(['wallet' => $wallet]);

        $this->assertDatabaseHas('wallet_nonces', [
            'wallet_address' => $wallet,
        ]);
    }

    public function test_nonce_rejects_invalid_wallet_format()
    {
        $response = $this->getJson('/api/auth/nonce?wallet=not-an-address');
        $response->assertStatus(422);
    }

    public function test_nonce_replaces_existing_nonce_for_same_wallet()
    {
        $wallet = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

        $this->getJson("/api/auth/nonce?wallet={$wallet}");
        $firstNonce = DB::table('wallet_nonces')
            ->where('wallet_address', $wallet)
            ->value('nonce');

        $this->getJson("/api/auth/nonce?wallet={$wallet}");
        $secondNonce = DB::table('wallet_nonces')
            ->where('wallet_address', $wallet)
            ->value('nonce');

        // A new nonce was generated
        $this->assertNotEquals($firstNonce, $secondNonce);
        // Only one nonce record exists for this wallet
        $this->assertEquals(1, DB::table('wallet_nonces')
            ->where('wallet_address', $wallet)->count());
    }

    // ── Verify endpoint ───────────────────────────────────────────────────────

    public function test_verify_rejects_request_with_no_nonce_in_db()
    {
        $response = $this->postJson('/api/auth/verify', [
            'wallet'    => '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
            'signature' => '0x' . str_repeat('a', 130),
        ]);

        $response->assertStatus(401)
                 ->assertJsonFragment(['error' => 'No valid nonce found. Request a new nonce first.']);
    }

    public function test_verify_rejects_expired_nonce()
    {
        $wallet = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

        DB::table('wallet_nonces')->insert([
            'wallet_address' => $wallet,
            'nonce'          => 'test-nonce-123',
            'expires_at'     => now()->subMinutes(10), // already expired
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);

        $response = $this->postJson('/api/auth/verify', [
            'wallet'    => $wallet,
            'signature' => '0x' . str_repeat('a', 130),
        ]);

        $response->assertStatus(401)
                 ->assertJsonFragment(['error' => 'No valid nonce found. Request a new nonce first.']);
    }

    public function test_verify_rejects_mismatched_signature()
    {
        $wallet = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

        DB::table('wallet_nonces')->insert([
            'wallet_address' => $wallet,
            'nonce'          => 'test-nonce-abc',
            'expires_at'     => now()->addMinutes(5),
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);

        // Random invalid signature — recovery will produce wrong address
        $response = $this->postJson('/api/auth/verify', [
            'wallet'    => $wallet,
            'signature' => '0x' . str_repeat('b', 130),
        ]);

        $response->assertStatus(401)
                 ->assertJsonFragment(['error' => 'Signature verification failed. Recovered address does not match.']);
    }

    // ── Authenticated endpoints ───────────────────────────────────────────────

    public function test_me_endpoint_requires_authentication()
    {
        $response = $this->getJson('/api/users/me');
        $response->assertStatus(401);
    }

    public function test_me_endpoint_returns_user_profile_when_authenticated()
    {
        $user = User::factory()->create([
            'wallet_address' => '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
            'role'           => 'entrepreneur',
            'kyc_status'     => 'pending',
        ]);

        $response = $this->actingAs($user)->getJson('/api/users/me');

        $response->assertStatus(200)
                 ->assertJsonPath('user.wallet_address', $user->wallet_address)
                 ->assertJsonPath('user.role', 'entrepreneur');
    }

    public function test_logout_revokes_current_token()
    {
        $user  = User::factory()->create(['wallet_address' => '0x1234' . str_repeat('0', 36)]);
        $token = $user->createToken('test')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$token}")
             ->postJson('/api/auth/logout')
             ->assertStatus(200)
             ->assertJson(['message' => 'Logged out successfully']);

        // Verify the token was deleted from the database (single-use token confirmed revoked).
        // Note: a direct HTTP check would pass via SPA session fallback (statefulApi),
        // so we verify revocation at the DB level — the authoritative store for tokens.
        $this->assertDatabaseMissing('personal_access_tokens', [
            'tokenable_id'   => $user->id,
            'tokenable_type' => User::class,
        ]);
    }

    // ── Role middleware ───────────────────────────────────────────────────────

    public function test_role_middleware_blocks_wrong_role()
    {
        $entrepreneur = User::factory()->create([
            'wallet_address' => '0x' . str_repeat('1', 40),
            'role'           => 'entrepreneur',
            'kyc_status'     => 'verified',
        ]);

        // KYC officer queue is only accessible to officers
        $response = $this->actingAs($entrepreneur)
                         ->getJson('/api/officer/kyc/queue');

        $response->assertStatus(403)
                 ->assertJsonPath('error', 'Insufficient role for this action.');
    }

    public function test_blacklisted_user_is_blocked_from_all_actions()
    {
        $user = User::factory()->create([
            'wallet_address' => '0x' . str_repeat('2', 40),
            'role'           => 'entrepreneur',
            'blacklisted'    => true,
        ]);

        $response = $this->actingAs($user)->postJson('/api/loans', [
            'amount_cfa'        => 50000,
            'duration_days'     => 30,
            'interest_rate_bps' => 1000,
        ]);

        $response->assertStatus(403)
                 ->assertJsonFragment(['error' => 'Your wallet has been blacklisted per CEMAC 2026 Regulation. Contact your MFI.']);
    }
}
