// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title IdentityRegistry
 * @notice Foundation contract for the EDL system. Maps wallet addresses
 *         to off-chain KYC hashes and manages the CEMAC 2026 blacklist.
 *
 *         This contract is DELIBERATELY self-contained — it imports
 *         nothing from access/EDLAccessControl.sol or RBACModifiers.sol.
 *         Identity must exist before roles can be checked against it,
 *         so this contract uses its own minimal officer/owner gating.
 *
 *         Dissertation reference: §3.4.1, §4.3.1 (Identity & KYC workflow)
 */
contract IdentityRegistry is Ownable {

    enum KYCStatus { Unregistered, Pending, Verified, Rejected }

    struct Identity {
        bytes32   kycHash;       // SHA-256 of off-chain KYC document
        KYCStatus status;
        uint256   registeredAt;
        string    role;          // human-readable hint only — NOT used for access control
    }

    mapping(address => Identity) public identities;
    mapping(address => bool)     public blacklisted;

    // Lightweight officer system — sufficient for this contract's own needs.
    // The full multi-role system (EDLAccessControl) is layered on top later.
    mapping(address => bool) public isOfficer;

    // Contracts (e.g. LoanFactory in Phase 8) authorized to call blacklistAddress()
    // automatically when a loan defaults — set by owner once those contracts exist.
    mapping(address => bool) public authorizedContracts;

    event IdentityRegistered(address indexed wallet, bytes32 kycHash, string role);
    event IdentityVerified(address indexed wallet, address indexed verifiedBy);
    event IdentityRejected(address indexed wallet, address indexed rejectedBy, string reason);
    event AddressBlacklisted(address indexed wallet, string reason);
    event AddressUnblacklisted(address indexed wallet);
    event OfficerStatusChanged(address indexed wallet, bool status);
    event AuthorizedContractChanged(address indexed contractAddr, bool status);

    modifier onlyOfficerOrOwner() {
        require(
            isOfficer[msg.sender] || owner() == msg.sender,
            "IdentityRegistry: caller is not an officer or owner"
        );
        _;
    }

    modifier onlyAuthorizedOrOwner() {
        require(
            authorizedContracts[msg.sender] || owner() == msg.sender,
            "IdentityRegistry: caller not authorized"
        );
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {
        // Deployer is an officer by default during early development/testing.
        // In production, the owner should immediately add real MFI officer
        // wallets and may choose to remove itself from isOfficer.
        isOfficer[initialOwner] = true;
    }

    // ── Officer & authorization management (owner only) ────────────────────────

    function setOfficer(address wallet, bool status) external onlyOwner {
        isOfficer[wallet] = status;
        emit OfficerStatusChanged(wallet, status);
    }

    function setAuthorizedContract(address contractAddr, bool status) external onlyOwner {
        authorizedContracts[contractAddr] = status;
        emit AuthorizedContractChanged(contractAddr, status);
    }

    // ── Identity lifecycle ───────────────────────────────────────────────────

    /**
     * @notice Self-registration. Any non-blacklisted, unregistered wallet
     *         can register. Status starts as Pending until an officer acts.
     */
    function registerIdentity(
        address wallet,
        bytes32 kycHash,
        string calldata role
    ) external {
        require(
            identities[wallet].status == KYCStatus.Unregistered,
            "IdentityRegistry: already registered"
        );
        require(!blacklisted[wallet], "IdentityRegistry: address is blacklisted");

        identities[wallet] = Identity({
            kycHash:      kycHash,
            status:       KYCStatus.Pending,
            registeredAt: block.timestamp,
            role:         role
        });

        emit IdentityRegistered(wallet, kycHash, role);
    }

    function verifyIdentity(address wallet) external onlyOfficerOrOwner {
        require(
            identities[wallet].status == KYCStatus.Pending,
            "IdentityRegistry: not in Pending state"
        );
        identities[wallet].status = KYCStatus.Verified;
        emit IdentityVerified(wallet, msg.sender);
    }

    function rejectIdentity(address wallet, string calldata reason)
        external
        onlyOfficerOrOwner
    {
        require(
            identities[wallet].status == KYCStatus.Pending,
            "IdentityRegistry: not in Pending state"
        );
        identities[wallet].status = KYCStatus.Rejected;
        emit IdentityRejected(wallet, msg.sender, reason);
    }

    // ── CEMAC 2026 blacklist ─────────────────────────────────────────────────

    /**
     * @notice Blacklist a wallet. Callable by the owner (manual/regulatory
     *         action) OR an authorized contract (e.g. LoanContract's
     *         automatic 90-day default trigger in Phase 8).
     */
    function blacklistAddress(address wallet, string calldata reason)
        external
        onlyAuthorizedOrOwner
    {
        blacklisted[wallet] = true;
        emit AddressBlacklisted(wallet, reason);
    }

    function unblacklistAddress(address wallet) external onlyOwner {
        blacklisted[wallet] = false;
        emit AddressUnblacklisted(wallet);
    }

    // ── View functions ───────────────────────────────────────────────────────

    /**
     * @notice A wallet is considered verified ONLY if its KYC status is
     *         Verified AND it is not currently blacklisted. This means
     *         blacklisting instantly revokes verified status everywhere
     *         in the system without any separate flag to manage.
     */
    function isVerified(address wallet) external view returns (bool) {
        return identities[wallet].status == KYCStatus.Verified
            && !blacklisted[wallet];
    }

    function getIdentity(address wallet) external view returns (Identity memory) {
        return identities[wallet];
    }
}
