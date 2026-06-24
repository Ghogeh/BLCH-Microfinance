<?php

return [
    // Ganache local dev — change to Besu endpoint for production
    'rpc_url' => env('BLOCKCHAIN_RPC_URL', 'http://127.0.0.1:8545'),

    // Admin wallet — deployer account with contract ownership
    // WARNING: Never commit a real private key. Use .env for all secrets.
    'admin_private_key' => env('ADMIN_PRIVATE_KEY'),

    // Deployed contract addresses (populated after each deploy)
    'contracts' => [
        'identity_registry'  => env('IDENTITY_REGISTRY_ADDRESS'),
        'edl_access_control' => env('EDL_ACCESS_CONTROL_ADDRESS'),
        'loan_factory'       => env('LOAN_FACTORY_ADDRESS'),
    ],

    // Event signature hashes — computed at runtime using Keccak-256.
    // Ethereum uses the original Keccak standard (NOT NIST SHA3-256).
    // These topic hashes are used by the M8 event listener to filter eth_getLogs.
    'event_signatures' => (function () {
        if (!class_exists(\kornrunner\Keccak::class)) {
            return [];
        }
        $k = fn (string $sig) => '0x' . \kornrunner\Keccak::hash($sig, 256);
        return [
            'IdentityRegistered'   => $k('IdentityRegistered(address,bytes32,string)'),
            'IdentityVerified'     => $k('IdentityVerified(address,address)'),
            'LoanContractDeployed' => $k('LoanContractDeployed(address,address,uint256,uint256,uint256)'),
            'Funded'               => $k('Funded(address,uint256,uint256)'),
            'LoanDisbursed'        => $k('LoanDisbursed(address,uint256)'),
            'RepaymentMade'        => $k('RepaymentMade(address,uint256,uint256)'),
            'DefaultDeclared'      => $k('DefaultDeclared(address,uint256)'),
            'AddressBlacklisted'   => $k('AddressBlacklisted(address,string)'),
        ];
    })(),

    // Block scanning interval for event listener (seconds between polls)
    'poll_interval_seconds' => env('BLOCKCHAIN_POLL_INTERVAL', 2),
];
