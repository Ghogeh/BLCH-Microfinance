// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "../IdentityRegistry.sol";
import "./Roles.sol";

/**
 * @title EDLAccessControl
 * @notice Multi-role RBAC layer used by LoanContract and LoanFactory
 *         (Phase 8). Every role grant is dual-gated: the wallet must
 *         hold the OpenZeppelin role AND be KYC-verified in
 *         IdentityRegistry AND not be blacklisted.
 *
 *         Dependency direction: this contract depends on IdentityRegistry.
 *         IdentityRegistry depends on NOTHING in this file — see the
 *         design note in IdentityRegistry.sol for why.
 */
contract EDLAccessControl is AccessControl {

    IdentityRegistry public immutable registry;

    event RoleAssigned(address indexed wallet, bytes32 indexed role, address indexed assignedBy);
    event RoleRevoked(address indexed wallet, bytes32 indexed role, address indexed revokedBy);

    constructor(address registryAddress, address adminWallet) {
        registry = IdentityRegistry(registryAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, adminWallet);
        _grantRole(Roles.ADMIN,        adminWallet);

        // ADMIN can assign/revoke every operational role.
        // DEFAULT_ADMIN_ROLE (OpenZeppelin's root) can assign/revoke ADMIN itself.
        _setRoleAdmin(Roles.ENTREPRENEUR, Roles.ADMIN);
        _setRoleAdmin(Roles.LENDER,       Roles.ADMIN);
        _setRoleAdmin(Roles.MFI_OFFICER,  Roles.ADMIN);
        _setRoleAdmin(Roles.REGULATOR,    Roles.ADMIN);
        _setRoleAdmin(Roles.GUARANTOR,    Roles.ADMIN);
        _setRoleAdmin(Roles.ADMIN,        DEFAULT_ADMIN_ROLE);
    }

    /**
     * @notice Assign a role to a wallet. Regulators are exempt from the
     *         standard KYC gate — they are onboarded as institutional
     *         supervisory nodes (COBAC/BEAC), not via self-registration.
     */
    function assignRole(address wallet, bytes32 role) external onlyRole(Roles.ADMIN) {
        if (role != Roles.REGULATOR) {
            require(
                registry.isVerified(wallet),
                "EDLAccessControl: wallet must be KYC-verified before role assignment"
            );
        }
        require(
            !registry.blacklisted(wallet),
            "EDLAccessControl: blacklisted address cannot hold a role"
        );

        _grantRole(role, wallet);
        emit RoleAssigned(wallet, role, msg.sender);
    }

    function revokeRoleFromWallet(address wallet, bytes32 role) external onlyRole(Roles.ADMIN) {
        _revokeRole(role, wallet);
        emit RoleRevoked(wallet, role, msg.sender);
    }

    /**
     * @notice Convenience check combining role membership with live KYC
     *         and blacklist status — used heavily by RBACModifiers in
     *         the next file.
     */
    function hasValidRole(address wallet, bytes32 role) external view returns (bool) {
        return hasRole(role, wallet)
            && registry.isVerified(wallet)
            && !registry.blacklisted(wallet);
    }
}
