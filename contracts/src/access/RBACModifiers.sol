// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./EDLAccessControl.sol";
import "./Roles.sol";

/**
 * @title RBACModifiers
 * @notice Reusable access modifiers for the EDL system's six actor roles.
 *         LoanContract and LoanFactory (Phase 8) inherit this contract.
 *
 *         Each modifier checks role membership AND live KYC/blacklist
 *         status via EDLAccessControl.hasValidRole() — never role
 *         membership alone.
 */
abstract contract RBACModifiers {

    EDLAccessControl public immutable acl;

    constructor(address aclAddress) {
        acl = EDLAccessControl(aclAddress);
    }

    modifier onlyEntrepreneur() {
        require(
            acl.hasValidRole(msg.sender, Roles.ENTREPRENEUR),
            "RBACModifiers: caller is not a valid ENTREPRENEUR"
        );
        _;
    }

    modifier onlyLender() {
        require(
            acl.hasValidRole(msg.sender, Roles.LENDER),
            "RBACModifiers: caller is not a valid LENDER"
        );
        _;
    }

    modifier onlyMFIOfficer() {
        require(
            acl.hasValidRole(msg.sender, Roles.MFI_OFFICER),
            "RBACModifiers: caller is not a valid MFI_OFFICER"
        );
        _;
    }

    modifier onlyRegulator() {
        require(
            acl.hasRole(Roles.REGULATOR, msg.sender),
            "RBACModifiers: caller does not hold REGULATOR role"
        );
        _;
    }

    modifier onlyGuarantor() {
        require(
            acl.hasValidRole(msg.sender, Roles.GUARANTOR) ||
            acl.hasValidRole(msg.sender, Roles.ENTREPRENEUR),
            "RBACModifiers: caller is not a valid GUARANTOR or ENTREPRENEUR"
        );
        _;
    }

    modifier onlyAdmin() {
        require(
            acl.hasRole(Roles.ADMIN, msg.sender),
            "RBACModifiers: caller does not hold ADMIN role"
        );
        _;
    }

    /// @dev Any of the six core operational roles — used for public-style
    ///      read functions that any consortium member may call.
    modifier onlyConsortiumMember() {
        require(
            acl.hasRole(Roles.ENTREPRENEUR, msg.sender) ||
            acl.hasRole(Roles.LENDER,       msg.sender) ||
            acl.hasRole(Roles.MFI_OFFICER,  msg.sender) ||
            acl.hasRole(Roles.REGULATOR,    msg.sender) ||
            acl.hasRole(Roles.GUARANTOR,    msg.sender) ||
            acl.hasRole(Roles.ADMIN,        msg.sender),
            "RBACModifiers: caller is not a consortium member"
        );
        _;
    }
}
