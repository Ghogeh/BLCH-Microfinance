// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../access/RBACModifiers.sol";
import "../IdentityRegistry.sol";
import "./ILoanFactory.sol";

/**
 * @title LoanContract
 * @notice Per-loan smart contract implementing the EDL five-state loan
 *         lifecycle machine. One instance is deployed per loan by
 *         LoanFactory.createLoan().
 *
 *         State machine:
 *           OPEN → FUNDING → ACTIVE → REPAID
 *                         ↘         ↘
 *                          DEFAULTED  DEFAULTED (via checkDefault)
 *
 *         Dissertation reference: §3.4.3 (Loan lifecycle), §4.3.3
 *         (Dynamic Credit Scoring), §4.3.4 (CEMAC 2026 Blacklisting)
 */
contract LoanContract is ReentrancyGuard, Pausable, RBACModifiers {

    // ── State machine ─────────────────────────────────────────────────────────

    enum LoanState { OPEN, FUNDING, ACTIVE, REPAID, DEFAULTED }

    struct RepaymentEntry {
        uint256 amount;
        uint256 timestamp;      // block.timestamp at payment
        uint256 remainingBalance;
    }

    // ── Immutable loan parameters ─────────────────────────────────────────────

    address public immutable borrower;
    address public immutable loanFactory;
    IdentityRegistry public immutable registry;

    uint256 public immutable loanAmount;
    uint256 public immutable dueDate;
    uint256 public immutable interestRateBps;
    uint256 public immutable totalRepayable; // loanAmount + interest

    // ── Mutable loan state ────────────────────────────────────────────────────

    uint256   public totalFunded;
    uint256   public remainingBalance;
    LoanState public state;
    uint256   public reputationScore;

    // Peer guarantee data
    address[]                     public  guarantors;
    mapping(address => bool)      private hasGuaranteed;

    // Repayment history — append-only, mirrors on-chain RepaymentEntry[]
    RepaymentEntry[] public repaymentHistory;

    // Borrower-controlled consent for lender history access
    mapping(address => bool) private lenderConsent;

    // ── Constants ─────────────────────────────────────────────────────────────

    uint256 public constant CEMAC_THRESHOLD_DAYS = 90;

    // ── Events ────────────────────────────────────────────────────────────────

    event LoanCreated(
        address indexed borrower,
        uint256 amount,
        uint256 durationDays,
        uint256 interestRateBps
    );
    event GuaranteeProvided(address indexed guarantor, uint256 guarantorCount);
    event Funded(address indexed funder, uint256 amount, uint256 totalFunded);
    event LoanDisbursed(address indexed borrower, uint256 amount);
    event RepaymentMade(
        address indexed borrower,
        uint256 amount,
        uint256 remainingBalance
    );
    event ReputationUpdated(address indexed borrower, uint256 newScore);
    event DefaultDeclared(address indexed borrower, uint256 daysOverdue);
    event LenderAccessGranted(address indexed borrower, address indexed lender);
    event LenderAccessRevoked(address indexed borrower, address indexed lender);
    event RegulatoryPenaltyTriggered(address indexed borrower, string reason);

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyWhenState(LoanState required) {
        require(state == required, "LoanContract: wrong state for this action");
        _;
    }

    modifier onlyBorrower() {
        require(
            msg.sender == borrower,
            "LoanContract: caller is not the borrower"
        );
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    /**
     * @notice Called exclusively by LoanFactory.createLoan().
     *         Validates borrower eligibility at deployment time so
     *         a blacklisted address cannot front-run the check.
     */
    constructor(
        address _borrower,
        uint256 _amount,
        uint256 _durationDays,
        uint256 _interestRateBps,
        address _registryAddress,
        address _aclAddress,
        address _loanFactory
    ) RBACModifiers(_aclAddress) {
        IdentityRegistry reg = IdentityRegistry(_registryAddress);

        require(
            reg.isVerified(_borrower),
            "LoanContract: borrower not KYC verified"
        );
        require(
            !reg.blacklisted(_borrower),
            "LoanContract: borrower is blacklisted"
        );

        borrower      = _borrower;
        loanFactory   = _loanFactory;
        registry      = reg;
        loanAmount    = _amount;
        interestRateBps = _interestRateBps;

        // Total repayable = principal + interest
        // Stored as immutable to prevent manipulation
        totalRepayable = _amount + (_amount * _interestRateBps / 10_000);
        remainingBalance = totalRepayable;

        // Due date anchored to block.timestamp at deployment
        dueDate = block.timestamp + (_durationDays * 1 days);

        state = LoanState.OPEN;
        reputationScore = 50; // base score per dissertation §4.3.3

        emit LoanCreated(_borrower, _amount, _durationDays, _interestRateBps);
    }

    // ── Loan lifecycle functions ──────────────────────────────────────────────

    /**
     * @notice Any KYC-verified, non-blacklisted, non-borrower wallet
     *         can provide a peer guarantee. Dissertation §3.4.1.
     *         Transitions OPEN → FUNDING on the first guarantee.
     */
    function provideGuarantee()
        external
        onlyWhenState(LoanState.OPEN)
        whenNotPaused
    {
        require(
            registry.isVerified(msg.sender),
            "LoanContract: guarantor not KYC verified"
        );
        require(
            !registry.blacklisted(msg.sender),
            "LoanContract: guarantor is blacklisted"
        );
        require(
            msg.sender != borrower,
            "LoanContract: borrower cannot guarantee own loan"
        );
        require(
            !hasGuaranteed[msg.sender],
            "LoanContract: already provided guarantee for this loan"
        );

        guarantors.push(msg.sender);
        hasGuaranteed[msg.sender] = true;

        // First guarantee transitions to FUNDING — lenders can now contribute
        if (state == LoanState.OPEN) {
            state = LoanState.FUNDING;
        }

        emit GuaranteeProvided(msg.sender, guarantors.length);
    }

    /**
     * @notice Lenders contribute ETH to the escrow. When totalFunded
     *         reaches loanAmount, disbursement fires automatically.
     *
     *         nonReentrant: prevents a malicious borrower's receive()
     *         fallback from calling fund() again during _disburse(),
     *         which could cause double-disbursement. See TC-SC-REN-01.
     */
    function fund()
        external
        payable
        nonReentrant
        onlyWhenState(LoanState.FUNDING)
        whenNotPaused
    {
        require(msg.value > 0,          "LoanContract: must send ETH");
        require(
            msg.sender != borrower,
            "LoanContract: borrower cannot fund own loan"
        );

        totalFunded += msg.value;
        emit Funded(msg.sender, msg.value, totalFunded);

        if (totalFunded >= loanAmount) {
            _disburse();
        }
    }

    /**
     * @notice Internal disbursement — called only from fund() when
     *         the funding threshold is met.
     *
     *         CRITICAL: state is set to ACTIVE BEFORE the ETH transfer.
     *         This is the checks-effects-interactions pattern.
     *         If the transfer re-enters, state == ACTIVE causes fund()
     *         to revert with "wrong state" before nonReentrant even fires.
     */
    function _disburse() internal {
        state = LoanState.ACTIVE; // ← effects first

        (bool sent, ) = payable(borrower).call{value: loanAmount}(""); // ← interaction last
        require(sent, "LoanContract: disbursement failed");

        emit LoanDisbursed(borrower, loanAmount);
    }

    /**
     * @notice Borrower submits a repayment instalment.
     *         Credit score is updated atomically in the same transaction.
     *         State transitions to REPAID when remainingBalance reaches 0.
     */
    function repay()
        external
        payable
        nonReentrant
        onlyBorrower
        onlyWhenState(LoanState.ACTIVE)
        whenNotPaused
    {
        require(msg.value > 0, "LoanContract: repayment must be > 0");
        require(
            msg.value <= remainingBalance,
            "LoanContract: repayment exceeds outstanding balance"
        );

        remainingBalance -= msg.value;

        repaymentHistory.push(RepaymentEntry({
            amount:           msg.value,
            timestamp:        block.timestamp,
            remainingBalance: remainingBalance
        }));

        emit RepaymentMade(borrower, msg.value, remainingBalance);

        // Score update is atomic — same tx as repayment (dissertation §4.3.3)
        _updateReputationScore();

        if (remainingBalance == 0) {
            state = LoanState.REPAID;
        }
    }

    /**
     * @notice Anyone in the consortium can call this to flag a loan as
     *         defaulted. If overdue by 90+ days, automatically triggers
     *         the CEMAC 2026 blacklist via the LoanFactory callback.
     */
    function checkDefault()
        external
        onlyWhenState(LoanState.ACTIVE)
    {
        require(
            block.timestamp > dueDate,
            "LoanContract: loan is not yet overdue"
        );
        require(
            remainingBalance > 0,
            "LoanContract: balance is already zero -- call repay() to finalise"
        );

        state = LoanState.DEFAULTED;

        uint256 secondsOverdue = block.timestamp - dueDate;
        uint256 daysOverdue    = secondsOverdue / 1 days;

        emit DefaultDeclared(borrower, daysOverdue);

        // CEMAC 2026 Blacklisting Regulation: 90-day threshold
        if (daysOverdue >= CEMAC_THRESHOLD_DAYS) {
            ILoanFactory(loanFactory).requestBlacklist(
                borrower,
                string.concat(
                    "CEMAC 2026: default of ",
                    _uintToString(daysOverdue),
                    " days"
                )
            );
        }
    }

    // ── Credit passport (consent-gated history) ───────────────────────────────

    function grantLenderAccess(address lender) external onlyBorrower {
        lenderConsent[lender] = true;
        emit LenderAccessGranted(borrower, lender);
    }

    function revokeLenderAccess(address lender) external onlyBorrower {
        lenderConsent[lender] = false;
        emit LenderAccessRevoked(borrower, lender);
    }

    /**
     * @notice Lenders call this to read repayment history.
     *         Requires explicit consent from the borrower.
     *         Dissertation §3.4.3: "borrower-controlled credit passport."
     */
    function getRepaymentHistory()
        external
        view
        returns (RepaymentEntry[] memory)
    {
        require(
            lenderConsent[msg.sender],
            "LoanContract: lender access not granted by borrower"
        );
        return repaymentHistory;
    }

    /**
     * @notice COBAC/BEAC regulators can read history WITHOUT borrower
     *         consent. Dissertation §4.3.4: "no login, no permission."
     */
    function getRepaymentHistoryRegulator()
        external
        view
        onlyRegulator
        returns (RepaymentEntry[] memory)
    {
        return repaymentHistory;
    }

    /**
     * @notice COBAC can manually trigger CEMAC penalty before the 90-day
     *         automated threshold if institutional intervention is needed.
     */
    function triggerRegulatoryPenalty(string calldata reason)
        external
        onlyRegulator
        onlyWhenState(LoanState.ACTIVE)
    {
        state = LoanState.DEFAULTED;
        emit RegulatoryPenaltyTriggered(borrower, reason);
        ILoanFactory(loanFactory).requestBlacklist(borrower, reason);
    }

    // ── Admin (emergency) ─────────────────────────────────────────────────────

    function pause()   external onlyAdmin { _pause(); }
    function unpause() external onlyAdmin { _unpause(); }

    // ── View functions ────────────────────────────────────────────────────────

    function getLoanState()      external view returns (LoanState) { return state; }
    function getGuarantors()     external view returns (address[] memory) { return guarantors; }
    function getRepaymentCount() external view returns (uint256) { return repaymentHistory.length; }
    function hasLenderAccess(address lender) external view returns (bool) {
        return lenderConsent[lender];
    }

    // ── Internal: Dynamic Credit Scoring ─────────────────────────────────────

    /**
     * @notice Implements the Dynamic Credit Score formula from §4.3.3:
     *
     *   R_b = 10 (base)
     *       + timeliness_component (0–60 pts)
     *       + volume_component     (0–30 pts)
     *
     *   timeliness = (onTimePayments / totalPayments) × 60
     *   volume     = (amountRepaid / totalRepayable) × 30
     *
     * All arithmetic multiplies before dividing to avoid integer
     * truncation to zero.
     */
    function _updateReputationScore() internal {
        uint256 total = repaymentHistory.length;
        if (total == 0) return;

        // Timeliness: payments made before the due date
        uint256 onTime = _countOnTimePayments(total);
        uint256 timelinessScore = onTime * 60 / total;

        // Volume: proportion of total repayable amount settled so far
        uint256 amountRepaid = totalRepayable - remainingBalance;
        uint256 volumeScore  = amountRepaid * 30 / totalRepayable;

        // Base 10 points for any repayment activity
        uint256 newScore = 10 + timelinessScore + volumeScore;
        if (newScore > 100) newScore = 100;

        reputationScore = newScore;
        emit ReputationUpdated(borrower, newScore);
    }

    function _countOnTimePayments(uint256 total)
        internal
        view
        returns (uint256 count)
    {
        for (uint256 i = 0; i < total; i++) {
            if (repaymentHistory[i].timestamp <= dueDate) {
                count++;
            }
        }
    }

    /// @dev Converts a uint256 to its decimal string representation.
    ///      Avoids OZ Strings.sol which requires Cancun EVM (mcopy opcode).
    function _uintToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
