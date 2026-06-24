<?php

namespace App\Services;

use Exception;

/**
 * IdentityRegistryService
 *
 * Domain-layer wrapper around BlockchainService for IdentityRegistry.sol.
 * Every method corresponds directly to a function in the smart contract.
 *
 * Call hierarchy:
 *   Controller → IdentityRegistryService → BlockchainService → Ganache
 */
class IdentityRegistryService
{
    private BlockchainService $blockchain;
    private string            $contractAddress;

    public function __construct(BlockchainService $blockchain)
    {
        $this->blockchain      = $blockchain;
        $this->contractAddress = config('blockchain.contracts.identity_registry');

        if (empty($this->contractAddress)) {
            throw new Exception(
                'IDENTITY_REGISTRY_ADDRESS not set in .env. ' .
                'Deploy contracts first: cd contracts && npx hardhat run scripts/deploy.js --network ganache'
            );
        }
    }

    /**
     * Check if a wallet is KYC-verified AND not blacklisted on-chain.
     * Calls: IdentityRegistry.isVerified(address) → bool
     */
    public function isVerified(string $walletAddress): bool
    {
        // Function selector: first 4 bytes of keccak256("isVerified(address)")
        $selector = '0xb9209e33';
        $encoded  = $selector . $this->blockchain->encodeAddress($walletAddress);

        $result = $this->blockchain->call($this->contractAddress, $encoded);
        return $this->blockchain->decodeBool($result);
    }

    /**
     * Check if a wallet is blacklisted on-chain.
     * Calls: IdentityRegistry.blacklisted(address) → bool
     */
    public function isBlacklisted(string $walletAddress): bool
    {
        // Function selector: keccak256("blacklisted(address)") first 4 bytes
        $selector = '0xdbac26e9';
        $encoded  = $selector . $this->blockchain->encodeAddress($walletAddress);

        $result = $this->blockchain->call($this->contractAddress, $encoded);
        return $this->blockchain->decodeBool($result);
    }

    /**
     * Register a new identity on-chain.
     * Calls: IdentityRegistry.registerIdentity(address, bytes32, string)
     * Returns the transaction receipt.
     */
    public function registerIdentity(
        string $walletAddress,
        string $kycHashHex,   // 64-char hex string (SHA-256 of KYC document)
        string $role          // e.g. "ENTREPRENEUR"
    ): array {
        // selector keccak256("registerIdentity(address,bytes32,string)")
        $selector = '0x45b13883';

        // ABI encode: address (32 bytes) + bytes32 (32 bytes) + dynamic string
        // For the dynamic string we need ABI dynamic encoding
        $encodedAddress = $this->blockchain->encodeAddress($walletAddress);
        $encodedHash    = $this->blockchain->encodeBytes32($kycHashHex);

        // Dynamic string offset (64 bytes = 2 × 32 for the static params above)
        $stringOffset   = $this->blockchain->encodeUint256(64);
        $roleBytes      = bin2hex($role);
        $roleLength     = $this->blockchain->encodeUint256(strlen($role));
        // Pad role string to 32-byte boundary
        $rolePadded     = str_pad($roleBytes, ceil(strlen($roleBytes) / 64) * 64, '0', STR_PAD_RIGHT);

        $data = $selector
              . $encodedAddress
              . $encodedHash
              . $stringOffset
              . $roleLength
              . $rolePadded;

        return $this->blockchain->sendAndWait($this->contractAddress, $data);
    }

    /**
     * Verify a pending identity (MFI Officer action).
     * Calls: IdentityRegistry.verifyIdentity(address)
     */
    public function verifyIdentity(string $walletAddress): array
    {
        // selector keccak256("verifyIdentity(address)")
        $selector = '0xb5b90fd9';
        $data     = $selector . $this->blockchain->encodeAddress($walletAddress);

        return $this->blockchain->sendAndWait($this->contractAddress, $data);
    }

    /**
     * Reject a pending identity (MFI Officer action).
     * Calls: IdentityRegistry.rejectIdentity(address, string)
     */
    public function rejectIdentity(string $walletAddress, string $reason): array
    {
        // selector keccak256("rejectIdentity(address,string)")
        $selector   = '0xba93cd86';
        $encoded    = $this->blockchain->encodeAddress($walletAddress);
        $offset     = $this->blockchain->encodeUint256(64);
        $reasonBytes= bin2hex($reason);
        $reasonLen  = $this->blockchain->encodeUint256(strlen($reason));
        $reasonPad  = str_pad($reasonBytes, ceil(strlen($reasonBytes)/64)*64, '0', STR_PAD_RIGHT);

        $data = $selector . $encoded . $offset . $reasonLen . $reasonPad;
        return $this->blockchain->sendAndWait($this->contractAddress, $data);
    }
}
