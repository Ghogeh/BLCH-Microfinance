<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use kornrunner\Keccak;
use Exception;

/**
 * BlockchainService
 *
 * The single point of contact between Laravel and the Ethereum node.
 * Sends JSON-RPC requests to Ganache (dev) or Hyperledger Besu (prod).
 *
 * Architecture note: this service NEVER makes business decisions.
 * It only translates PHP method calls into JSON-RPC calls and
 * returns raw results. Business logic lives in the callers.
 */
class BlockchainService
{
    private string $rpcUrl;
    private string $adminPrivateKey;
    private int    $rpcId = 1;

    public function __construct()
    {
        $this->rpcUrl          = config('blockchain.rpc_url');
        $this->adminPrivateKey = config('blockchain.admin_private_key');
    }

    // ── Raw JSON-RPC ──────────────────────────────────────────────────────────

    /**
     * Send a raw JSON-RPC request to the Ethereum node.
     * This is the foundation of every other method in this class.
     */
    public function rpc(string $method, array $params = []): mixed
    {
        $payload = [
            'jsonrpc' => '2.0',
            'method'  => $method,
            'params'  => $params,
            'id'      => $this->rpcId++,
        ];

        $response = Http::timeout(30)
            ->post($this->rpcUrl, $payload);

        if ($response->failed()) {
            throw new Exception(
                "Blockchain RPC failed [{$method}]: HTTP " . $response->status()
            );
        }

        $data = $response->json();

        if (isset($data['error'])) {
            throw new Exception(
                "Blockchain RPC error [{$method}]: " . $data['error']['message']
            );
        }

        return $data['result'];
    }

    // ── Network information ───────────────────────────────────────────────────

    public function getBlockNumber(): int
    {
        $hex = $this->rpc('eth_blockNumber');
        return hexdec($hex);
    }

    public function getNetworkId(): string
    {
        return $this->rpc('net_version');
    }

    public function isConnected(): bool
    {
        try {
            $this->getBlockNumber();
            return true;
        } catch (Exception) {
            return false;
        }
    }

    // ── Account management ────────────────────────────────────────────────────

    public function getAccounts(): array
    {
        return $this->rpc('eth_accounts');
    }

    public function getBalance(string $address): string
    {
        $wei = $this->rpc('eth_getBalance', [$address, 'latest']);
        return $wei; // Return in wei; convert to ETH in caller if needed
    }

    // ── Contract reads (eth_call — no gas, no tx) ─────────────────────────────

    /**
     * Call a read-only (view/pure) contract function.
     * Uses eth_call — instantaneous, no transaction, no gas cost.
     *
     * @param string $contractAddress  The deployed contract address
     * @param string $data             ABI-encoded function call (use encode* helpers)
     */
    public function call(string $contractAddress, string $data): string
    {
        return $this->rpc('eth_call', [
            [
                'to'   => $contractAddress,
                'data' => $data,
            ],
            'latest'
        ]);
    }

    // ── Contract writes (eth_sendTransaction — costs gas, creates tx) ──────────

    /**
     * Send a state-changing transaction to a contract function.
     * Uses the admin account (Ganache account[0]).
     * Returns the transaction hash.
     *
     * In production on Besu PoA, the admin account is the deployer
     * with sufficient ETH. On Ganache, all accounts are pre-funded.
     */
    public function sendTransaction(
        string  $contractAddress,
        string  $data,
        ?string $from  = null,
        string  $value = '0x0',
        int     $gas   = 500000
    ): string {
        $accounts = $this->getAccounts();
        $sender   = $from ?? ($accounts[0] ?? throw new Exception(
            "BlockchainService: no accounts available in node"
        ));

        return $this->rpc('eth_sendTransaction', [[
            'from'  => $sender,
            'to'    => $contractAddress,
            'data'  => $data,
            'value' => '0x0',
            'gas'   => '0x' . dechex($gas),
        ]]);
    }

    /**
     * Send a transaction and wait for it to be mined.
     * Returns the transaction receipt or throws after timeout.
     */
    public function sendAndWait(
        string  $contractAddress,
        string  $data,
        ?string $from          = null,
        int     $gas           = 500000,
        int     $maxWaitSeconds = 30
    ): array {
        $txHash = $this->sendTransaction($contractAddress, $data, $from, '0x0', $gas);

        $deadline = time() + $maxWaitSeconds;
        while (time() < $deadline) {
            $receipt = $this->rpc('eth_getTransactionReceipt', [$txHash]);
            if ($receipt !== null) {
                if ($receipt['status'] === '0x0') {
                    throw new Exception(
                        "Transaction reverted: {$txHash}. " .
                        "Contract execution failed on-chain."
                    );
                }
                return array_merge($receipt, ['txHash' => $txHash]);
            }
            usleep(500000); // 0.5 second poll
        }

        throw new Exception(
            "Transaction not mined within {$maxWaitSeconds}s: {$txHash}"
        );
    }

    // ── Event log queries ─────────────────────────────────────────────────────

    /**
     * Fetch event logs from a contract between two block numbers.
     * Used by the M8 event listener to scan for on-chain events.
     *
     * @param string $contractAddress
     * @param string $eventSignatureHash  keccak256 of event signature
     *                                    e.g. keccak256("LoanCreated(address,uint256,uint256,uint256)")
     * @param int    $fromBlock
     * @param int    $toBlock            0 = latest
     */
    public function getLogs(
        string $contractAddress,
        string $eventSignatureHash,
        int    $fromBlock,
        int    $toBlock = 0
    ): array {
        $to = $toBlock > 0 ? '0x' . dechex($toBlock) : 'latest';

        return $this->rpc('eth_getLogs', [[
            'address'   => $contractAddress,
            'topics'    => [$eventSignatureHash],
            'fromBlock' => '0x' . dechex($fromBlock),
            'toBlock'   => $to,
        ]]) ?? [];
    }

    // ── ABI encoding helpers ──────────────────────────────────────────────────

    /**
     * Encode a function selector from its signature string.
     * First 4 bytes of keccak256 of the function signature.
     *
     * Uses kornrunner\Keccak (installed via composer) — Ethereum uses
     * the original Keccak-256, NOT the NIST SHA3-256 standard.
     *
     * Example: encodeSelector("isVerified(address)") → "0x13dcd88e"
     */
    public function encodeSelector(string $functionSignature): string
    {
        $hash = Keccak::hash($functionSignature, 256);
        return '0x' . substr($hash, 0, 8);
    }

    /**
     * Encode an Ethereum address as 32 bytes (padded to 64 hex chars).
     * Ethereum addresses are 20 bytes; ABI encoding pads to 32 bytes.
     */
    public function encodeAddress(string $address): string
    {
        $clean = ltrim(strtolower($address), '0x');
        return str_pad($clean, 64, '0', STR_PAD_LEFT);
    }

    /**
     * Encode a uint256 as 32 bytes.
     */
    public function encodeUint256(int|string $value): string
    {
        $hex = dechex((int)$value);
        return str_pad($hex, 64, '0', STR_PAD_LEFT);
    }

    /**
     * Encode a bytes32 value (already hex string, pad or trim to 32 bytes).
     */
    public function encodeBytes32(string $hexValue): string
    {
        $clean = ltrim($hexValue, '0x');
        return str_pad(substr($clean, 0, 64), 64, '0', STR_PAD_RIGHT);
    }

    /**
     * Decode a boolean result from an eth_call response.
     */
    public function decodeBool(string $hex): bool
    {
        return hexdec(ltrim($hex, '0x')) === 1;
    }

    /**
     * Decode an address from an eth_call response.
     */
    public function decodeAddress(string $hex): string
    {
        $clean = ltrim($hex, '0x');
        return '0x' . substr($clean, 24); // last 20 bytes of 32-byte word
    }

    /**
     * Decode a uint256 from an eth_call response.
     */
    public function decodeUint256(string $hex): string
    {
        return (string)hexdec(ltrim($hex, '0x'));
    }
}
