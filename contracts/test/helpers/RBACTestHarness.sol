// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../src/access/RBACModifiers.sol";

/**
 * @title RBACTestHarness
 * @notice TEST-ONLY contract. Exposes one trivial function per modifier
 *         in RBACModifiers so the test suite has something concrete to
 *         call. This contract is NEVER deployed as part of the real
 *         EDL system — it lives in test/helpers/ specifically to make
 *         that obvious.
 */
contract RBACTestHarness is RBACModifiers {
    constructor(address aclAddress) RBACModifiers(aclAddress) {}

    function entrepreneurOnlyAction() external onlyEntrepreneur returns (bool) { return true; }
    function lenderOnlyAction()       external onlyLender       returns (bool) { return true; }
    function officerOnlyAction()      external onlyMFIOfficer   returns (bool) { return true; }
    function regulatorOnlyAction()    external onlyRegulator    returns (bool) { return true; }
    function guarantorOnlyAction()    external onlyGuarantor    returns (bool) { return true; }
    function adminOnlyAction()        external onlyAdmin        returns (bool) { return true; }
    function consortiumOnlyAction()   external onlyConsortiumMember returns (bool) { return true; }
}
