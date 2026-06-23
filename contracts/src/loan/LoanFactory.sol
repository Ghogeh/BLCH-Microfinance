// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../IdentityRegistry.sol";
import "../access/EDLAccessControl.sol";
import "./ILoanFactory.sol";
import "./LoanContract.sol";

contract LoanFactory is Ownable, ILoanFactory {

    IdentityRegistry  public immutable registry;
    EDLAccessControl  public immutable acl;

    address[]                            public allLoans;
    mapping(address => bool)             public isDeployedLoan;
    mapping(address => address[])        public borrowerLoans;

    event LoanContractDeployed(
        address indexed loanContract,
        address indexed borrower,
        uint256 amount,
        uint256 durationDays,
        uint256 interestRateBps
    );

    event BlacklistRequestExecuted(
        address indexed loanContract,
        address indexed borrower,
        string reason
    );

    constructor(
        address registryAddress,
        address aclAddress,
        address initialOwner
    ) Ownable(initialOwner) {
        registry = IdentityRegistry(registryAddress);
        acl      = EDLAccessControl(aclAddress);
    }

    function createLoan(
        uint256 amount,
        uint256 durationDays,
        uint256 interestRateBps
    ) external returns (address loanAddress) {
        require(
            registry.isVerified(msg.sender),
            "LoanFactory: borrower not KYC verified"
        );
        require(
            !registry.blacklisted(msg.sender),
            "LoanFactory: borrower is blacklisted"
        );
        require(amount > 0,       "LoanFactory: loan amount must be > 0");
        require(durationDays > 0, "LoanFactory: duration must be > 0");
        require(
            interestRateBps <= 3000,
            "LoanFactory: interest rate cannot exceed 30%"
        );

        LoanContract loan = new LoanContract(
            msg.sender,
            amount,
            durationDays,
            interestRateBps,
            address(registry),
            address(acl),
            address(this)
        );

        loanAddress = address(loan);
        allLoans.push(loanAddress);
        isDeployedLoan[loanAddress]       = true;
        borrowerLoans[msg.sender].push(loanAddress);

        emit LoanContractDeployed(
            loanAddress,
            msg.sender,
            amount,
            durationDays,
            interestRateBps
        );
    }

    function requestBlacklist(
        address borrowerAddress,
        string calldata reason
    ) external override {
        require(
            isDeployedLoan[msg.sender],
            "LoanFactory: caller is not a deployed loan contract"
        );
        registry.blacklistAddress(borrowerAddress, reason);
        emit BlacklistRequestExecuted(msg.sender, borrowerAddress, reason);
    }

    function getAllLoans() external view returns (address[] memory) {
        return allLoans;
    }

    function getLoan(uint256 index) external view returns (address) {
        require(index < allLoans.length, "LoanFactory: index out of bounds");
        return allLoans[index];
    }

    function getBorrowerLoans(address borrowerAddr)
        external
        view
        returns (address[] memory)
    {
        return borrowerLoans[borrowerAddr];
    }

    function getLoanCount() external view returns (uint256) {
        return allLoans.length;
    }
}
