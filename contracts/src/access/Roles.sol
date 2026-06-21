// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Roles
 * @notice Central registry of role identifiers for the EDL system.
 *         Six roles map exactly to the six actors in docs/ACTORS.md.
 *
 * Why bytes32 instead of an enum:
 * AccessControl (OpenZeppelin) uses bytes32 role identifiers so that
 * new roles can be added in future contract versions without changing
 * the type signature of hasRole(), grantRole(), etc. An enum would
 * require redeploying every contract that references it.
 */
library Roles {
    bytes32 internal constant ENTREPRENEUR = keccak256("ENTREPRENEUR");
    bytes32 internal constant LENDER       = keccak256("LENDER");
    bytes32 internal constant MFI_OFFICER  = keccak256("MFI_OFFICER");
    bytes32 internal constant REGULATOR    = keccak256("REGULATOR");
    bytes32 internal constant GUARANTOR    = keccak256("GUARANTOR");
    bytes32 internal constant ADMIN        = keccak256("ADMIN");
}
