<?php
namespace Database\Seeders;

use App\Models\Loan;
use App\Models\LoanGuarantor;
use App\Models\LoanFunder;
use App\Models\Repayment;
use App\Models\CreditScore;
use App\Models\AuditLog;
use Illuminate\Database\Seeder;

class LoanSeeder extends Seeder
{
    public function run(): void
    {
        $chioma    = \App\Models\User::where('email', 'chioma@gmail.com')->first();
        $bertrand  = \App\Models\User::where('email', 'bertrand@gmail.com')->first();
        $sacco     = \App\Models\User::where('email', 'lending@saccobc.cm')->first();
        $procredit = \App\Models\User::where('email', 'lending@procredit.cm')->first();
        $officer   = \App\Models\User::where('email', 'officer@camMFI.cm')->first();

        // ── Loan 1: ACTIVE loan (disbursed, repayments in progress) ───────────
        $loan1 = Loan::create([
            'contract_address'      => '0x5FbDB2315678afecb367f032d93F642f64180aa3',
            'borrower_id'           => $chioma->id,
            'approved_by'           => $officer->id,
            'amount_cfa'            => 200000.00,
            'duration_days'         => 90,
            'interest_rate_bps'     => 1000,
            'state'                 => 'ACTIVE',
            'total_funded_cfa'      => 200000.00,
            'remaining_balance_cfa' => 165000.00,
            'due_date'              => now()->addDays(60),
            'disbursed_at'          => now()->subDays(30),
            'required_guarantees'   => 2,
            'current_guarantees'    => 2,
        ]);

        LoanGuarantor::create([
            'loan_id'       => $loan1->id,
            'guarantor_id'  => $bertrand->id,
            'guaranteed_at' => now()->subDays(32),
            'status'        => 'active',
        ]);

        LoanFunder::create([
            'loan_id'           => $loan1->id,
            'funder_id'         => $sacco->id,
            'amount_funded_cfa' => 120000.00,
            'funded_at'         => now()->subDays(31),
        ]);

        LoanFunder::create([
            'loan_id'           => $loan1->id,
            'funder_id'         => $procredit->id,
            'amount_funded_cfa' => 80000.00,
            'funded_at'         => now()->subDays(31),
        ]);

        Repayment::create([
            'loan_id'                => $loan1->id,
            'borrower_id'            => $chioma->id,
            'amount_paid_cfa'        => 55000.00,
            'remaining_after_cfa'    => 165000.00,
            'was_on_time'            => true,
            'days_late'              => 0,
            'reputation_score_after' => 65,
        ]);

        // ── Loan 2: FUNDING state (awaiting more lenders) ─────────────────────
        $loan2 = Loan::create([
            'contract_address'    => '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
            'borrower_id'         => $bertrand->id,
            'approved_by'         => $officer->id,
            'amount_cfa'          => 300000.00,
            'duration_days'       => 60,
            'interest_rate_bps'   => 800,
            'state'               => 'FUNDING',
            'total_funded_cfa'    => 150000.00,
            'due_date'            => now()->addDays(75),
            'required_guarantees' => 1,
            'current_guarantees'  => 1,
        ]);

        LoanGuarantor::create([
            'loan_id'       => $loan2->id,
            'guarantor_id'  => $chioma->id,
            'guaranteed_at' => now()->subDays(2),
            'status'        => 'active',
        ]);

        LoanFunder::create([
            'loan_id'           => $loan2->id,
            'funder_id'         => $sacco->id,
            'amount_funded_cfa' => 150000.00,
            'funded_at'         => now()->subDays(1),
        ]);

        // ── Credit scores for Chioma ───────────────────────────────────────────
        CreditScore::create([
            'user_id'              => $chioma->id,
            'score'                => 65.00,
            'on_time_payments'     => 1,
            'total_payments'       => 1,
            'cumulative_volume_cfa'=> 55000.00,
            'cumulative_days_late' => 0,
            'total_loans_completed'=> 0,
            'calculated_at'        => now()->subDays(15),
        ]);

        // ── Audit log entries ─────────────────────────────────────────────────
        AuditLog::create([
            'actor_id'         => $chioma->id,
            'actor_role'       => 'entrepreneur',
            'action'           => 'LOAN_CREATED',
            'entity_type'      => 'loan',
            'entity_id'        => $loan1->id,
            'contract_address' => $loan1->contract_address,
            'details'          => ['amount_cfa' => 200000, 'duration_days' => 90],
        ]);

        AuditLog::create([
            'actor_role'       => 'contract',
            'action'           => 'LOAN_DISBURSED',
            'entity_type'      => 'loan',
            'entity_id'        => $loan1->id,
            'contract_address' => $loan1->contract_address,
            'details'          => ['borrower' => $chioma->wallet_address, 'amount_cfa' => 200000],
        ]);

        $this->command->info('✓ 2 loans seeded: 1 ACTIVE (with repayment), 1 FUNDING');
    }
}
