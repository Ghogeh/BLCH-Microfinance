# Solidity Smart Contracts
- IdentityRegistry.sol   DID + KYC hash + blacklist management
- LoanFactory.sol        Deploys LoanContract instances
- LoanContract.sol       Per-loan state machine + credit scoring
- access/
  - Roles.sol            bytes32 role constants
  - EDLAccessControl.sol OpenZeppelin AccessControl base
  - RBACModifiers.sol    All role modifier definitions
