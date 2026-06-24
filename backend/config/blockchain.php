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

    // Event signature hashes (keccak256 of event signatures)
    // Used by the M8 event listener to filter logs
    // NOTE: Ethereum uses Keccak-256 (pre-NIST), not SHA3-256.
    // These are computed correctly at runtime via kornrunner\Keccak::hash().
    // The values here are placeholders; use BlockchainService::encodeSelector()
    // to compute the correct hashes at runtime.
    'event_signatures' => [
        'IdentityRegistered'   => env('EVENT_SIG_IDENTITY_REGISTERED'),
        'IdentityVerified'     => env('EVENT_SIG_IDENTITY_VERIFIED'),
        'LoanContractDeployed' => env('EVENT_SIG_LOAN_DEPLOYED'),
        'Funded'               => env('EVENT_SIG_FUNDED'),
        'LoanDisbursed'        => env('EVENT_SIG_DISBURSED'),
        'RepaymentMade'        => env('EVENT_SIG_REPAYMENT'),
        'DefaultDeclared'      => env('EVENT_SIG_DEFAULT'),
        'AddressBlacklisted'   => env('EVENT_SIG_BLACKLISTED'),
    ],

    // Block scanning interval for event listener (seconds between polls)
    'poll_interval_seconds' => env('BLOCKCHAIN_POLL_INTERVAL', 2),
];
