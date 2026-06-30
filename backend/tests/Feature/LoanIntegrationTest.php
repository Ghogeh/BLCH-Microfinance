<?php

namespace Tests\Feature;

use App\Models\Loan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LoanIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private function verifiedEntrepreneur(): User
    {
        return User::factory()->create([
            'wallet_address' => '0x' . bin2hex(random_bytes(20)),
            'role'           => 'entrepreneur',
            'kyc_status'     => 'verified',
            'blacklisted'    => false,
        ]);
    }

    private function verifiedLender(): User
    {
        return User::factory()->lender()->create([
            'wallet_address' => '0x' . bin2hex(random_bytes(20)),
        ]);
    }

    public function test_loan_index_requires_authentication(): void
    {
        $this->getJson('/api/loans')->assertStatus(401);
    }

    public function test_entrepreneur_sees_only_own_loans(): void
    {
        $e1 = $this->verifiedEntrepreneur();
        $e2 = $this->verifiedEntrepreneur();

        Loan::factory()->create(['borrower_id' => $e1->id, 'state' => 'OPEN']);
        Loan::factory()->create(['borrower_id' => $e2->id, 'state' => 'OPEN']);

        $response = $this->actingAs($e1)->getJson('/api/loans');
        $response->assertStatus(200);
        $loans = $response->json('data');
        $this->assertCount(1, $loans);
        $this->assertEquals($e1->id, $loans[0]['borrower_id']);
    }

    public function test_lender_sees_non_open_loans(): void
    {
        $lender   = $this->verifiedLender();
        $borrower = $this->verifiedEntrepreneur();

        Loan::factory()->create(['borrower_id' => $borrower->id, 'state' => 'FUNDING']);
        Loan::factory()->create(['borrower_id' => $borrower->id, 'state' => 'ACTIVE']);
        Loan::factory()->create(['borrower_id' => $borrower->id, 'state' => 'OPEN']);

        $response = $this->actingAs($lender)->getJson('/api/loans');
        $response->assertStatus(200);
        $loans  = $response->json('data');
        $states = array_column($loans, 'state');
        // Lender sees FUNDING and ACTIVE but NOT OPEN
        $this->assertNotContains('OPEN', $states);
    }

    public function test_loan_creation_requires_kyc_verified(): void
    {
        $user = User::factory()->create([
            'wallet_address' => '0x' . bin2hex(random_bytes(20)),
            'role'           => 'entrepreneur',
            'kyc_status'     => 'pending', // NOT verified
        ]);

        $response = $this->actingAs($user)->postJson('/api/loans', [
            'amount_cfa'        => 100000,
            'duration_days'     => 30,
            'interest_rate_bps' => 1000,
        ]);

        $response->assertStatus(403)
                 ->assertJsonFragment(['error' => 'KYC verification required before this action.']);
    }

    public function test_blacklisted_user_blocked_from_creating_loan(): void
    {
        $user = User::factory()->create([
            'wallet_address' => '0x' . bin2hex(random_bytes(20)),
            'role'           => 'entrepreneur',
            'kyc_status'     => 'verified',
            'blacklisted'    => true,
        ]);

        $response = $this->actingAs($user)->postJson('/api/loans', [
            'amount_cfa'        => 100000,
            'duration_days'     => 30,
            'interest_rate_bps' => 1000,
        ]);

        $response->assertStatus(403);
    }

    public function test_loan_show_returns_on_chain_state_field(): void
    {
        $user = $this->verifiedEntrepreneur();
        $loan = Loan::factory()->create([
            'borrower_id' => $user->id,
            'state'       => 'ACTIVE',
        ]);

        $response = $this->actingAs($user)->getJson("/api/loans/{$loan->id}");
        $response->assertStatus(200)
                 ->assertJsonStructure(['loan', 'on_chain_state', 'state_in_sync']);
    }

    public function test_regulator_can_access_audit_loans(): void
    {
        $regulator = User::factory()->create([
            'wallet_address' => '0x' . bin2hex(random_bytes(20)),
            'role'           => 'regulator',
            'kyc_status'     => 'verified',
        ]);

        $this->actingAs($regulator)
            ->getJson('/api/audit/loans')
            ->assertStatus(200);
    }

    public function test_entrepreneur_blocked_from_audit_endpoint(): void
    {
        $entrepreneur = $this->verifiedEntrepreneur();

        $this->actingAs($entrepreneur)
            ->getJson('/api/audit/loans')
            ->assertStatus(403);
    }
}
