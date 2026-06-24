<?php

namespace App\Services;

use Exception;

/**
 * LoanFactoryService
 *
 * Domain-layer wrapper for LoanFactory.sol and LoanContract.sol.
 * Translates business operations into on-chain function calls.
 */
class LoanFactoryService
{
    private BlockchainService $blockchain;
    private string $factoryAddress;

    public function __construct(BlockchainService $blockchain)
    {
        $this->blockchain     = $blockchain;
        $this->factoryAddress = config('blockchain.contracts.loan_factory');

        if (empty($this->factoryAddress)) {
            throw new Exception('LOAN_FACTORY_ADDRESS not set in .env');
        }
    }

    /**
     * Create a new loan on-chain via LoanFactory.createLoan()
     * Called by LoanController@store
     */
    public function createLoan(
        string $borrowerWallet,
        int    $amountWei,
        int    $durationDays,
        int    $interestRateBps
    ): array {
        // selector keccak256("createLoan(uint256,uint256,uint256)")
        $selector = '0x904b513b';
        $data     = $selector
                  . $this->blockchain->encodeUint256($amountWei)
                  . $this->blockchain->encodeUint256($durationDays)
                  . $this->blockchain->encodeUint256($interestRateBps);

        // Send from the borrower's address so msg.sender == borrower in contract
        // In Ganache, we control all accounts so we can send from any address.
        // In production with Besu, users sign transactions client-side via MetaMask.
        return $this->blockchain->sendAndWait(
            $this->factoryAddress,
            $data,
            $borrowerWallet,
            600000
        );
    }

    /**
     * Get the address of the most recently deployed loan for a borrower.
     * Used to link the newly created loan contract address to MySQL.
     */
    public function getLatestLoanForBorrower(string $borrowerWallet): string
    {
        // selector keccak256("getBorrowerLoans(address)")
        $selector = '0xeee8b7ff';
        $data     = $selector . $this->blockchain->encodeAddress($borrowerWallet);

        $result    = $this->blockchain->call($this->factoryAddress, $data);
        $addresses = $this->decodeAddressArray($result);
        return end($addresses) ?: '0x0';
    }

    /**
     * Provide a peer guarantee on a loan contract.
     * Calls LoanContract.provideGuarantee()
     */
    public function provideGuarantee(
        string $loanContractAddress,
        string $guarantorWallet
    ): array {
        // selector keccak256("provideGuarantee()")
        $selector = '0x7e28d54b';
        return $this->blockchain->sendAndWait(
            $loanContractAddress,
            $selector,
            $guarantorWallet,
            150000
        );
    }

    /**
     * Fund a loan.
     * Calls LoanContract.fund() — sends ETH value.
     */
    public function fund(
        string $loanContractAddress,
        string $lenderWallet,
        int    $amountWei
    ): string {
        // selector keccak256("fund()")
        $selector = '0xb60d4288';
        $weiHex   = '0x' . dechex($amountWei);

        return $this->blockchain->rpc('eth_sendTransaction', [[
            'from'  => $lenderWallet,
            'to'    => $loanContractAddress,
            'data'  => $selector,
            'value' => $weiHex,
            'gas'   => '0x' . dechex(300000),
        ]]);
    }

    /**
     * Submit a repayment.
     * Calls LoanContract.repay() — borrower sends ETH.
     */
    public function repay(
        string $loanContractAddress,
        string $borrowerWallet,
        int    $amountWei
    ): string {
        // selector keccak256("repay()")
        $selector = '0x402d8883';
        $weiHex   = '0x' . dechex($amountWei);

        return $this->blockchain->rpc('eth_sendTransaction', [[
            'from'  => $borrowerWallet,
            'to'    => $loanContractAddress,
            'data'  => $selector,
            'value' => $weiHex,
            'gas'   => '0x' . dechex(300000),
        ]]);
    }

    /**
     * Check if a loan has defaulted.
     * Calls LoanContract.checkDefault()
     */
    public function checkDefault(
        string $loanContractAddress,
        string $callerWallet
    ): array {
        // selector keccak256("checkDefault()")
        $selector = '0x5c001281';
        return $this->blockchain->sendAndWait(
            $loanContractAddress,
            $selector,
            $callerWallet,
            200000
        );
    }

    /**
     * Grant lender access to repayment history (credit passport).
     */
    public function grantLenderAccess(
        string $loanContractAddress,
        string $borrowerWallet,
        string $lenderWallet
    ): array {
        // selector keccak256("grantLenderAccess(address)")
        $selector = '0x124b4590';
        $data     = $selector . $this->blockchain->encodeAddress($lenderWallet);
        return $this->blockchain->sendAndWait(
            $loanContractAddress, $data, $borrowerWallet, 100000
        );
    }

    /**
     * Revoke lender access to repayment history.
     */
    public function revokeLenderAccess(
        string $loanContractAddress,
        string $borrowerWallet,
        string $lenderWallet
    ): array {
        // selector keccak256("revokeLenderAccess(address)")
        $selector = '0xde874597';
        $data     = $selector . $this->blockchain->encodeAddress($lenderWallet);
        return $this->blockchain->sendAndWait(
            $loanContractAddress, $data, $borrowerWallet, 100000
        );
    }

    /**
     * Get on-chain loan state (0=OPEN,1=FUNDING,2=ACTIVE,3=REPAID,4=DEFAULTED)
     */
    public function getLoanState(string $loanContractAddress): int
    {
        // selector keccak256("getLoanState()")
        $selector = '0x9e9f669c';
        $result   = $this->blockchain->call($loanContractAddress, $selector);
        return (int)$this->blockchain->decodeUint256($result);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private function decodeAddressArray(string $hex): array
    {
        $clean = ltrim($hex, '0x');
        if (strlen($clean) < 128) return [];
        // Skip offset (32 bytes) and length (32 bytes)
        $count     = hexdec(substr($clean, 64, 64));
        $addresses = [];
        for ($i = 0; $i < $count; $i++) {
            $word        = substr($clean, 128 + $i * 64, 64);
            $addresses[] = '0x' . substr($word, 24);
        }
        return $addresses;
    }
}
