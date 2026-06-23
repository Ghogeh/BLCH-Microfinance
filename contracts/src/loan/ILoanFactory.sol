// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ILoanFactory
 * @notice Interface that LoanContract uses to call back to LoanFactory
 *         when a 90-day CEMAC default triggers automatic blacklisting.
 *
 *         Using an interface (not a direct import) breaks what would
 *         otherwise be a circular dependency:
 *           LoanFactory → LoanContract → LoanFactory (cycle!)
 *         With the interface:
 *           LoanFactory → LoanContract → ILoanFactory (no cycle)
 *
 *         Dissertation reference: §4.3.4 — CEMAC 2026 Blacklisting
 */
interface ILoanFactory {
    /**
     * @notice Request that the factory blacklist a borrower address.
     *         Only callable by a contract address that the factory
     *         recognises as one of its own deployed loans.
     * @param borrowerAddress The defaulting borrower wallet
     * @param reason          Human-readable reason including days overdue
     */
    function requestBlacklist(
        address borrowerAddress,
        string calldata reason
    ) external;
}
