<?php
namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        // ── Admin ─────────────────────────────────────────────────────────────
        User::create([
            'wallet_address'   => '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
            'role'             => 'admin',
            'name'             => 'EDL System Admin',
            'email'            => 'admin@edl.cm',
            'kyc_status'       => 'verified',
            'institution_name' => 'EDL Consortium',
            'password'         => Hash::make('password'),
        ]);

        // ── MFI Officer ───────────────────────────────────────────────────────
        User::create([
            'wallet_address'   => '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
            'role'             => 'officer',
            'name'             => 'Mbah Emmanuel',
            'email'            => 'officer@camMFI.cm',
            'phone'            => '+237 6XX XXX XXX',
            'kyc_status'       => 'verified',
            'institution_name' => 'CamMFI Bamenda',
            'password'         => Hash::make('password'),
        ]);

        // ── Entrepreneurs (Borrowers) ─────────────────────────────────────────
        User::create([
            'wallet_address' => '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
            'role'           => 'entrepreneur',
            'name'           => 'Nkemdirim Chioma',
            'email'          => 'chioma@gmail.com',
            'phone'          => '+237 6XX XXX XXX',
            'kyc_status'     => 'verified',
            'kyc_hash'       => str_repeat('a', 64),
        ]);

        User::create([
            'wallet_address' => '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
            'role'           => 'entrepreneur',
            'name'           => 'Fon Bertrand',
            'email'          => 'bertrand@gmail.com',
            'phone'          => '+237 6XX XXX XXX',
            'kyc_status'     => 'verified',
            'kyc_hash'       => str_repeat('b', 64),
        ]);

        User::create([
            'wallet_address' => '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
            'role'           => 'entrepreneur',
            'name'           => 'Tabi Grace',
            'email'          => 'grace@gmail.com',
            'phone'          => '+237 6XX XXX XXX',
            'kyc_status'     => 'pending',
        ]);

        // ── Lenders ───────────────────────────────────────────────────────────
        User::create([
            'wallet_address'   => '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
            'role'             => 'lender',
            'name'             => 'SACCO Bamenda Cooperative',
            'email'            => 'lending@saccobc.cm',
            'kyc_status'       => 'verified',
            'institution_name' => 'SACCO Bamenda Cooperative',
        ]);

        User::create([
            'wallet_address'   => '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
            'role'             => 'lender',
            'name'             => 'ProCredit MFI',
            'email'            => 'lending@procredit.cm',
            'kyc_status'       => 'verified',
            'institution_name' => 'ProCredit MFI Cameroon',
        ]);

        // ── Regulator ─────────────────────────────────────────────────────────
        User::create([
            'wallet_address'   => '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
            'role'             => 'regulator',
            'name'             => 'COBAC Supervisory Node',
            'email'            => 'audit@cobac.cm',
            'kyc_status'       => 'verified',
            'institution_name' => 'COBAC — Central African Banking Commission',
        ]);

        $this->command->info('✓ 8 users seeded: 1 admin, 1 officer, 3 entrepreneurs, 2 lenders, 1 regulator');
    }
}
