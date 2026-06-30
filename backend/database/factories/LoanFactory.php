<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class LoanFactory extends Factory
{
    public function definition(): array
    {
        return [
            'contract_address'      => '0x' . bin2hex(random_bytes(20)),
            'borrower_id'           => User::factory(),
            'amount_cfa'            => $this->faker->numberBetween(50000, 500000),
            'amount_wei'            => (string) $this->faker->numberBetween(50000, 500000),
            'duration_days'         => $this->faker->randomElement([30, 60, 90]),
            'interest_rate_bps'     => 1000,
            'state'                 => 'OPEN',
            'total_funded_cfa'      => 0,
            'remaining_balance_cfa' => null,
            'due_date'              => now()->addDays(30),
            'required_guarantees'   => 1,
            'current_guarantees'    => 0,
            'cobac_notified'        => false,
        ];
    }

    public function active(): static
    {
        return $this->state(fn () => [
            'state'                 => 'ACTIVE',
            'total_funded_cfa'      => 100000,
            'remaining_balance_cfa' => 110000,
            'disbursed_at'          => now()->subDays(5),
        ]);
    }

    public function defaulted(): static
    {
        return $this->state(fn () => [
            'state'        => 'DEFAULTED',
            'defaulted_at' => now()->subDays(2),
            'days_overdue' => 32,
        ]);
    }
}
