// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MaliciousBorrower
 * @notice TEST-ONLY contract. Simulates a borrower that attempts to
 *         re-enter LoanContract.fund() from inside its receive() fallback
 *         when it receives ETH from _disburse().
 *
 *         If ReentrancyGuard is working correctly, the re-entrant fund()
 *         call will revert with "ReentrancyGuard: reentrant call".
 *
 *         This contract is NEVER deployed in production.
 *         Lives in src/test-helpers/ (not test/helpers/) because Hardhat
 *         only compiles .sol files from the configured sources path (./src).
 */
contract MaliciousBorrower {

    address public targetLoan;
    bool    public reentrancyAttempted;
    bool    public reentrancySucceeded;

    function setTarget(address _loan) external {
        targetLoan = _loan;
    }

    /**
     * @dev Fires when this contract receives ETH (i.e. from _disburse()).
     *      Attempts to call fund() on the same loan to trigger a second
     *      disbursement. This is the classic reentrancy attack.
     */
    receive() external payable {
        if (targetLoan != address(0) && !reentrancyAttempted) {
            reentrancyAttempted = true;
            (bool success, ) = targetLoan.call{value: 0}(
                abi.encodeWithSignature("fund()")
            );
            reentrancySucceeded = success;
        }
    }

    // Allows the test to give this contract ETH to repay
    function deposit() external payable {}

    // Allows the test to inspect contract balance
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
