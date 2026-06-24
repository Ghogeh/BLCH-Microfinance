<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class UserFactory extends Factory
{
    public function definition(): array
    {
        static $counter = 0;
        $counter++;
        return [
            'wallet_address'   => '0x' . str_pad(dechex($counter), 40, '0', STR_PAD_LEFT),
            'role'             => 'entrepreneur',
            'name'             => $this->faker->name(),
            'email'            => $this->faker->unique()->safeEmail(),
            'phone'            => $this->faker->phoneNumber(),
            'kyc_status'       => 'pending',
            'blacklisted'      => false,
            'institution_name' => null,
        ];
    }

    public function verified(): static {
        return $this->state(fn () => ['kyc_status' => 'verified']);
    }

    public function lender(): static {
        return $this->state(fn () => ['role' => 'lender', 'kyc_status' => 'verified']);
    }

    public function officer(): static {
        return $this->state(fn () => ['role' => 'officer', 'kyc_status' => 'verified']);
    }

    public function blacklisted(): static {
        return $this->state(fn () => ['blacklisted' => true]);
    }
}
