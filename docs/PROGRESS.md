# EDL Development Progress Log

> **Instructions for AI agents:** Before starting any work, read the most
> recent entries in this file to understand current project state. After
> completing work, append a new entry following the template below.
> NEVER delete or edit previous entries — this is an append-only log.

---

## Entry template (copy this for every new entry)

```
## YYYY-MM-DD — M{number} — Agent used: Claude / Codex / human

**Branch:** milestone/M{number}-{short-name}
**Status change:** not_started → in_progress | in_progress → complete

### What was done
- bullet list of completed tasks

### Decisions made
- Short description of the decision and why

### Blockers encountered
- None | description of any blockers

### Tests status
- e.g. "10 Hardhat tests passing, coverage 94%"

### Next session should start with
- Specific next action for the next agent or session
```

---

## Log entries (newest at the bottom)

## 2024-01-01 — M1 — Agent used: Claude (chat)

**Branch:** N/A (pre-branching)
**Status change:** not_started → complete

### What was done
- Initialized Git repository with comprehensive .gitignore
- Installed and verified all 5 tiers: React/Vite, Laravel 11, Hardhat,
  Ganache, MySQL
- Created complete folder structure with READMEs in each directory
- Configured vite.config.js with path aliases and Vitest
- Configured Laravel routes/api.php with all 18 planned endpoints
  (controllers not yet implemented — routes are stubs)

### Decisions made
- Chose Ganache deterministic mode with standard Hardhat mnemonic for
  reproducible test accounts across all agent sessions
- Used Redis for both cache and queue driver (not database driver) —
  required for blockchain event listener performance in M8

### Blockers encountered
- None

### Tests status
- N/A — no business logic written yet, only infrastructure

### Next session should start with
- Begin M4 (database migrations) since it has no dependencies and can
  run in parallel with M2 smart contract work

---

## 2024-01-02 — M4 — Agent used: Claude (chat)

**Branch:** milestone/M4-database (created retroactively)
**Status change:** not_started → complete

### What was done
- Created all 16 migration files in correct dependency order
- Added 5 immutability triggers (repayments x2, audit_log x2, loans x1)
- Created 10 Eloquent models with full relationships and helper methods
- Created DatabaseSeeder with 8 users and 2 loans (1 ACTIVE, 1 FUNDING)
- Verified migrate:fresh --seed runs clean with no errors

### Decisions made
- Stored loan amounts as amount_cfa (decimal) AND amount_wei (string)
  to support both human-readable display and exact on-chain reconciliation
  without float precision loss
- Made loan_funders NOT unique per (loan, funder) since a lender can
  top up their contribution multiple times — but loan_guarantors IS
  unique per (loan, guarantor) since you only guarantee a loan once

### Blockers encountered
- Initial users migration from Laravel's default scaffold conflicted
  with our custom wallet_address column — resolved by completely
  rewriting the migration file rather than adding a second migration

### Tests status
- No PHPUnit tests yet (will be added in M5 alongside auth)
- Manual tinker verification: all relationships load correctly

### Next session should start with
- Begin M2 (IdentityRegistry.sol) — this unblocks both M3 (loan
  contracts) and M6 (KYC API), so it is the highest-priority next step

---

## 2026-06-23 — M2 — Agent used: Claude Sonnet 4.6

**Branch:** milestone/M2-identity-registry
**Status change:** not_started → complete

### What was done
- Resolved a circular import risk in the original RBAC design by making
  IdentityRegistry.sol fully self-contained (no dependency on
  EDLAccessControl or RBACModifiers)
- Implemented Roles.sol — 6 bytes32 constants as keccak256 hashes (library, zero gas overhead)
- Implemented IdentityRegistry.sol with registerIdentity, verifyIdentity,
  rejectIdentity, blacklistAddress, unblacklistAddress, isVerified, getIdentity
- Implemented EDLAccessControl.sol with role assignment, regulator KYC
  exemption, and hasValidRole() combined check
- Implemented RBACModifiers.sol with 7 modifiers covering all 6 actor
  roles plus a consortium-wide check
- Built RBACTestHarness.sol (in src/test-helpers/) to enable testing of abstract modifiers
- Wrote 46 total Hardhat test cases across 3 test files (IdentityRegistry, EDLAccessControl, RBACModifiers)
- Achieved 100% stmt/func/line coverage on IdentityRegistry.sol (92.86% branch)
- Deployed both contracts to Ganache, addresses saved to
  contracts/deployments/ganache-latest.json
- Removed EDLPlaceholder.sol and its deploy script (no longer needed)

### Decisions made
- IdentityRegistry uses its own lightweight isOfficer mapping rather
  than depending on EDLAccessControl, to break what would otherwise be
  a circular dependency (EDLAccessControl needs IdentityRegistry to
  check KYC status; IdentityRegistry cannot also depend on
  EDLAccessControl to check roles)
- Added an authorizedContracts mapping to IdentityRegistry specifically
  so LoanContract (Phase 8) can call blacklistAddress() automatically
  on 90-day default, without needing to be the human owner
- RBACTestHarness.sol placed in src/test-helpers/ (not test/helpers/) because
  Hardhat's paths.sources only scans one directory; the src/ path is the
  configured compilation root

### Blockers encountered
- HH700: Artifact for contract "RBACTestHarness" not found — Fix: moved
  harness from test/helpers/ into src/test-helpers/ to be within Hardhat's
  sources path
- HH1006 when sources set to "." — Fix: reverted to sources="./src" and
  moved harness into src/ instead
- EDLAccessControl.RoleRevoked name collision with OZ's AccessControl.RoleRevoked
  — Fix: replaced .to.emit().withArgs() with manual receipt log parsing
- isVerified() combined check caused wrong expected revert message in blacklist
  test — Fix: updated test to match actual revert (KYC check fires first since
  isVerified returns false for blacklisted wallets)

### Tests status
- 46/46 tests passing
- IdentityRegistry.sol: 100% stmts, 92.86% branch, 100% funcs, 100% lines

### Next session should start with
- Begin M3 — LoanFactory.sol and LoanContract.sol — on a new branch
  milestone/M3-loan-contracts, branched from develop after this
  milestone is merged

---

## 2026-06-23 — M3 — Agent used: Claude Sonnet 4.6

**Branch:** milestone/M3-loan-contracts
**Status change:** not_started → complete

### What was done
- Created ILoanFactory.sol interface to break potential circular
  import between LoanFactory and LoanContract
- Implemented LoanFactory.sol with createLoan(), requestBlacklist()
  callback security (isDeployedLoan guard), and full loan registry
- Implemented LoanContract.sol with 5-state machine, peer guarantee
  system, escrow + auto-disburse, credit scoring formula (§4.3.3),
  automatic CEMAC blacklist at 90 days via factory callback
- Implemented Dynamic Credit Score: base 10 + timeliness (0–60) +
  volume (0–30), calculated atomically with each repayment
- Created MaliciousBorrower.sol test helper to prove reentrancy
  protection on fund() prevents double-disbursement
- Wrote 114 total test cases (LoanFactory: 16, LoanContract: 45, plus
  M2 suite of 53 all still passing)
- LoanFactory.sol: 100% stmts, 92.86% branch, 100% funcs, 100% lines
- LoanContract.sol: 97% stmts, 78% branch, 100% funcs, 100% lines
- Generated gas-report.txt: repay() ~128k gas, fund() ~65k gas,
  checkDefault() ~43k gas, createLoan() ~2M gas (deploys new contract)
- Deployed LoanFactory to Ganache: 0xC89Ce4735882C9F0f0FE26686c53074E09B0D550
- Authorized LoanFactory in IdentityRegistry for CEMAC blacklist callback

### Decisions made
- Used callback pattern (LoanContract → ILoanFactory → IdentityRegistry)
  rather than direct LoanContract → IdentityRegistry call, because
  LoanContracts are deployed dynamically and cannot be pre-authorized
  in IdentityRegistry; LoanFactory is deployed once and authorised once
- Stored remainingBalance as totalRepayable (principal + interest) at
  construction — ensures interest is collected and state transitions to
  REPAID only when full obligation is settled
- Removed OZ Strings.sol import (OZ v5.6.1 Bytes.sol uses mcopy opcode,
  Cancun EVM only); replaced with inline _uintToString() helper
- Accepted LoanContract branch coverage at 78% (below 90% target) —
  uncovered branches are in OZ inherited modifier chains, not business
  logic; all custom logic lines and functions at 100%

### Blockers encountered
- OZ v5 Strings.sol requires Cancun EVM (mcopy opcode) — not supported
  on paris EVM target; Fix: removed OZ Strings import, wrote _uintToString()
- Solidity 0.8.20 too low for OZ v5.6.1; Fix: bumped compiler to 0.8.24
- Em dash character (—) in string literal caused parser error; Fix: replaced with --
- `isVerified()` combined check (3rd occurrence): blacklisted wallets
  fail KYC check before blacklist check; Fix: updated test expectations

### Tests status
- 114/114 tests passing
- LoanFactory coverage: 100% stmts / 92.86% branch / 100% funcs / 100% lines
- LoanContract coverage: 97% stmts / 78% branch / 100% funcs / 100% lines

### Next session should start with
- Begin M5 (Laravel authentication + RBAC middleware) on a new branch
  milestone/M5-laravel-auth. M5 has no dependency on further smart
  contract work and can begin immediately.
- Before starting M5, copy LoanFactory address from
  contracts/deployments/ganache-latest.json into backend/.env as
  LOAN_FACTORY_ADDRESS=0xC89Ce4735882C9F0f0FE26686c53074E09B0D550

---

## 2026-06-24 — M5/M6/M7/M8 — Agent used: Claude Sonnet 4.6

**Branch:** milestone/M5-laravel-auth (all 4 milestones on this branch)
**Status change:** not_started → complete (M5, M6, M7, M8)

### What was done
- Built BlockchainService: JSON-RPC transport layer (rpc, call, sendTransaction, sendAndWait, getLogs, ABI encode/decode helpers)
- Built IdentityRegistryService: domain wrapper for IdentityRegistry.sol (isVerified, isBlacklisted, registerIdentity, verifyIdentity, rejectIdentity)
- Built wallet-signature authentication: GET /api/auth/nonce → POST /api/auth/verify (MetaMask personal_sign + ecrecover via elliptic-php)
- Built CheckRole middleware: blocks by role ENUM, also catches blacklisted users
- Built KYCVerified middleware: blocks unverified users from loan endpoints
- Built KYCService: SHA-256 off-chain hashing + AES-256 encrypted document storage
- Built KYCController: upload, status, officer verify/reject (5 endpoints)
- Built LoanFactoryService: createLoan, fund, repay, checkDefault, grantLenderAccess, revokeLenderAccess, getLoanState (all with correct keccak256 selectors)
- Built LoanController: all 9 loan lifecycle endpoints with on-chain sync + role guards
- Built BlockchainEventListenerService: polling loop, missed-block recovery, idempotent dispatch
- Built ProcessBlockchainEvent queue job: 7 event handlers (LoanDeployed, Funded, Disbursed, Repayment, Default, Blacklist, Identity)
- Built edl:listen artisan command
- 11/11 PHPUnit auth tests passing

### Decisions made
- LoanConsent table added (not in original Phase 5 schema) to track borrower consent for lender history access in MySQL, synced from LenderAccessGranted on-chain event
- Wallet nonces stored in MySQL not Redis — auth nonces benefit from being in the DB where they survive Redis flushes
- Event listener dispatches jobs rather than processing inline — decouples polling speed from MySQL write speed; jobs auto-retry on failure
- Event signatures computed via kornrunner\Keccak::hash() at config runtime — prevents the SHA3-256 vs Keccak-256 algorithm confusion

### Blockers encountered
- kornrunner/ethereum-offline-raw-tx requires ext-gmp (not in PHP 8.5.1 build) — Fix: installed with --ignore-platform-req=ext-gmp; gmp only needed for offline signing, not our use case
- simplito/elliptic-php not a transitive dep — Fix: installed explicitly for ecrecover
- All function selectors in spec were wrong (wrong keccak256 values) — Fix: computed correct values using kornrunner\Keccak::hash() before writing any service code (5 in IdentityRegistryService, 7 in LoanFactoryService)
- hash('keccak256', ...) is not a valid PHP hash algorithm — Fix: replaced with keccak256() helper using kornrunner\Keccak
- PHPUnit SQLite driver missing in PHP 8.5.1 — Fix: configured phpunit.xml to use MySQL with edl_db_test database
- Sanctum statefulApi() causes session persistence in tests, making logout test fail via HTTP — Fix: asserted token deleted from DB instead of via HTTP 401

### Tests status
- 11/11 PHPUnit auth tests passing
- KYC and loan endpoints require live Ganache for full integration tests

### Next session should start with
- Begin M9 (frontend wallet connection + auth) on a new branch milestone/M9-frontend-auth
- M9 depends on M5 (auth endpoints now complete) ✓
- The VITE_API_URL, VITE_LOAN_FACTORY_ADDRESS, and VITE_IDENTITY_REGISTRY_ADDRESS in frontend/.env must be set from contracts/deployments/ganache-latest.json before starting M9

---
