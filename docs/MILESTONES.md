# EDL Development Roadmap — 14 Milestones

**Status legend:** ⬜ Not started | 🟦 In progress | ✅ Complete | ⚠️ Blocked

---

## M1 — Project Initialization & Environment Setup
**Status:** ✅ Complete (Phase 4)
**Branch:** N/A (done before branching strategy existed)
**Estimated effort:** 3–5 days
**Dependencies:** None

**Scope:** Folder structure, package installs, Ganache/Laravel/React/Hardhat
all running and verified to communicate.

**Definition of Done:**
- [x] Monorepo structure matches docs/ARCHITECTURE.md
- [x] `npm run dev` starts React without errors
- [x] `php artisan serve` starts Laravel without errors
- [x] `npx hardhat compile` succeeds
- [x] Ganache running and reachable via curl
- [x] Vite proxy reaches Laravel API (verified via curl)

---

## M2 — Smart Contract: IdentityRegistry.sol
**Status:** ⬜ Not started
**Branch:** milestone/M2-identity-registry
**Estimated effort:** 5–7 days
**Dependencies:** M1

**Scope:** On-chain DID registry, KYC hash storage, blacklist management,
RBAC foundation (Roles.sol, EDLAccessControl.sol, RBACModifiers.sol).

**Definition of Done:**
- [ ] Roles.sol defines all 6 role constants
- [ ] EDLAccessControl.sol deployed and role assignment tested
- [ ] IdentityRegistry.sol implements registerIdentity, verifyIdentity,
      rejectIdentity, blacklistAddress, isVerified
- [ ] Minimum 10 Hardhat test cases passing (npx hardhat test)
- [ ] Test coverage ≥ 90% on IdentityRegistry.sol (npx hardhat coverage)
- [ ] Contract deployed to Ganache via scripts/deploy.js
- [ ] Deployed address saved to contracts/deployments/ganache-latest.json
- [ ] No compiler warnings on `npx hardhat compile`

---

## M3 — Smart Contracts: LoanFactory + LoanContract
**Status:** ⬜ Not started
**Branch:** milestone/M3-loan-contracts
**Estimated effort:** 10–14 days
**Dependencies:** M2 (requires IdentityRegistry + RBAC)

**Scope:** Full loan lifecycle state machine — OPEN→FUNDING→ACTIVE→
REPAID/DEFAULTED. All 7 core functions from dissertation §3.4.3.

**Definition of Done:**
- [ ] LoanFactory.sol deploys LoanContract instances correctly
- [ ] LoanContract.sol implements all 7 functions: provideGuarantee,
      fund, repay, checkDefault, grantLenderAccess, getRepaymentHistory,
      triggerRegulatoryPenalty
- [ ] State machine guards prevent ALL invalid transitions (tested)
- [ ] ReentrancyGuard applied to fund() and repay()
- [ ] CEMAC 90-day blacklist trigger tested and working
- [ ] Minimum 20 Hardhat test cases passing (covers all 5 states + edge cases)
- [ ] Test coverage ≥ 90% on LoanContract.sol
- [ ] Gas cost report generated (npx hardhat test --gas-reporter)
- [ ] Contracts deployed to Ganache, addresses saved

---

## M4 — Database Migrations & Eloquent Models
**Status:** ✅ Complete (Phase 5)
**Branch:** milestone/M4-database (already merged)
**Estimated effort:** 3–4 days
**Dependencies:** None (can run parallel to M2/M3)

**Definition of Done:**
- [x] All 16 tables created via migration
- [x] 5 immutability triggers verified working
- [x] 10 Eloquent models with relationships
- [x] Seeders produce realistic test data
- [x] `php artisan migrate:fresh --seed` runs clean

---

## M5 — Laravel Authentication & RBAC Middleware
**Status:** ⬜ Not started
**Branch:** milestone/M5-laravel-auth
**Estimated effort:** 4–5 days
**Dependencies:** M4

**Scope:** Sanctum token auth, wallet-signature login, role-based
middleware matching the 6 Solidity roles.

**Definition of Done:**
- [ ] POST /api/register creates user + returns Sanctum token
- [ ] POST /api/login verifies wallet signature (not password) for
      blockchain-native auth
- [ ] role: middleware blocks unauthorized roles (tested with PHPUnit)
- [ ] GET /api/users/me returns authenticated user profile
- [ ] Minimum 8 PHPUnit feature tests passing
- [ ] Postman collection exported and committed to docs/api/

---

## M6 — Backend API: KYC & Identity Endpoints
**Status:** ⬜ Not started
**Branch:** milestone/M6-kyc-api
**Estimated effort:** 3–4 days
**Dependencies:** M5, M2 (needs IdentityRegistry deployed)

**Definition of Done:**
- [ ] POST /api/kyc/upload stores encrypted doc + computes SHA-256
- [ ] SHA-256 hash matches between PHP hash() and on-chain commit
- [ ] BlockchainService.php successfully calls registerIdentity()
- [ ] POST /api/officer/kyc/{id}/verify calls verifyIdentity() on-chain
- [ ] users.kyc_status syncs correctly after on-chain confirmation
- [ ] Minimum 6 PHPUnit tests including hash-matching assertion

---

## M7 — Backend API: Loan Lifecycle Endpoints
**Status:** ⬜ Not started
**Branch:** milestone/M7-loan-api
**Estimated effort:** 7–10 days
**Dependencies:** M6, M3 (needs LoanContract deployed)

**Definition of Done:**
- [ ] All 9 loan endpoints implemented (create, fund, repay, guarantee,
      check-default, history, grant/revoke access, show, index)
- [ ] Every endpoint calls the correct smart contract function via
      BlockchainService
- [ ] Off-chain MySQL state matches on-chain state after every call
      (verified via integration test)
- [ ] Role-based authorization enforced on every endpoint
- [ ] Minimum 15 PHPUnit feature tests passing

---

## M8 — Blockchain Event Listener Service
**Status:** ⬜ Not started
**Branch:** milestone/M8-event-listener
**Estimated effort:** 4–5 days
**Dependencies:** M7

**Scope:** Laravel Queue worker that subscribes to on-chain events and
syncs MySQL — this is what keeps Phase 5's tables accurate.

**Definition of Done:**
- [ ] Listener catches LoanCreated, Funded, LoanDisbursed, RepaymentMade,
      DefaultDeclared, AddressBlacklisted events
- [ ] Each event updates the correct MySQL table within one queue cycle
- [ ] audit_log receives an entry for every processed event
- [ ] Listener recovers correctly after being stopped and restarted
      (re-scans missed blocks)
- [ ] Tested by triggering each event type manually and confirming
      DB state

---

## M9 — Frontend: Wallet Connection & Auth
**Status:** ⬜ Not started
**Branch:** milestone/M9-frontend-auth
**Estimated effort:** 3–4 days
**Dependencies:** M5

**Definition of Done:**
- [ ] useWallet.js hook connects MetaMask, exposes address/chainId/signer
- [ ] WalletContext provides global wallet state
- [ ] AuthContext manages Sanctum token + user role
- [ ] Role-based route guards (RequireRole component) working
- [ ] Vitest unit tests for useWallet passing

---

## M10 — Frontend: Borrower Dashboard & Loan Request
**Status:** ⬜ Not started
**Branch:** milestone/M10-borrower-ui
**Estimated effort:** 5–7 days
**Dependencies:** M9, M7

**Definition of Done:**
- [ ] BorrowerDashboard shows credit score gauge, active loan card,
      repayment history
- [ ] LoanRequestPage form validates and submits createLoan() via MetaMask
- [ ] RepaymentPage allows partial/full repayment with live balance update
- [ ] All loan states render correct colour-coded badges
- [ ] Responsive on mobile viewport (375px width minimum)

---

## M11 — Frontend: Lender & Officer Dashboards
**Status:** ⬜ Not started
**Branch:** milestone/M11-lender-officer-ui
**Estimated effort:** 5–7 days
**Dependencies:** M9, M7

**Definition of Done:**
- [ ] LenderDashboard shows fundable loans + portfolio
- [ ] FundButton executes fund() with correct ETH value
- [ ] OfficerPanel shows KYC queue with verify/reject actions
- [ ] CreditPassport component displays cross-institution history
      (with consent flow)

---

## M12 — Frontend: Regulator Audit Portal
**Status:** ⬜ Not started
**Branch:** milestone/M12-audit-portal
**Estimated effort:** 3–4 days
**Dependencies:** M9, M8

**Definition of Done:**
- [ ] AuditPortal lists all loans regardless of institution
- [ ] MerkleVerifier component calls verify-merkle endpoint, shows result
- [ ] BlacklistManager shows blacklist table with CEMAC compliance status
- [ ] No consent gating — regulator sees everything (per dissertation §4.3.4)

---

## M13 — Integration Testing & Bug Fixes
**Status:** ⬜ Not started
**Branch:** milestone/M13-integration-tests
**Estimated effort:** 5–7 days
**Dependencies:** M2–M12 all complete

**Definition of Done:**
- [ ] All 5 dissertation scenarios (§4.5) pass end-to-end
- [ ] Playwright E2E test suite covers full borrower journey
- [ ] No console errors in browser during any user flow
- [ ] Load test: 50 concurrent loan creations without failure

---

## M14 — Deployment (Docker + Documentation)
**Status:** ⬜ Not started
**Branch:** milestone/M14-deployment
**Estimated effort:** 3–5 days
**Dependencies:** M13

**Definition of Done:**
- [ ] docker-compose.yml runs all services with one command
- [ ] Hardhat deploy script targets Besu testnet successfully
- [ ] docs/DEPLOYMENT.md walks through fresh-machine setup
- [ ] Final dissertation evaluation report generated (Phase 12 deliverable)

---

## Critical path

The dependency chain that determines minimum project timeline:

```
M1 ──► M2 ──────────────────► M3 ──────────────────────────────────────────────┐
        │                       │                                                 │
        │                       └──► M6 ──► M7 ──► M8 ──► M12 ──┐              │
        │                                    │                     │              │
        └──► M4 ──► M5 ──► M6 (above)        └──► M9 ──► M10 ──► M13 ──► M14 ──┘
                                              │          M11 ──┘
                                              └──► M9 (above)
```

**Linear critical path (minimum sequencing):**

```
M1 → M2 → M3 → M6 → M7 → M8 → M9 → M10 → M13 → M14
```

**What can run in parallel:**

| Parallel track A | Parallel track B |
|---|---|
| M2 (IdentityRegistry) | M4 (Database) — already done |
| M3 (LoanFactory + LoanContract) | M5 (Laravel Auth) after M4 |
| M6 (KYC API) after M2+M5 | M9 (Frontend Auth) after M5 |
| M7 (Loan API) after M3+M6 | M11 (Lender/Officer UI) after M9+M7 |
| M8 (Event Listener) after M7 | M12 (Audit Portal) after M9+M8 |
| M10 (Borrower UI) after M9+M7 | |

**Estimated total timeline:**
- Sequential (one person, one task at a time): ~65–80 days
- Parallel (two tracks): ~40–50 days
- With AI agents accelerating each milestone: ~15–25 days

---

## Current status snapshot

| Milestone | Status | Effort | Blocker |
|---|---|---|---|
| M1 Environment | ✅ Done | — | — |
| M2 IdentityRegistry | ⬜ Next | 5–7 days | None |
| M3 LoanContracts | ⬜ | 10–14 days | M2 |
| M4 Database | ✅ Done | — | — |
| M5 Laravel Auth | ⬜ | 4–5 days | M4 (done) |
| M6 KYC API | ⬜ | 3–4 days | M5, M2 |
| M7 Loan API | ⬜ | 7–10 days | M6, M3 |
| M8 Event Listener | ⬜ | 4–5 days | M7 |
| M9 Frontend Auth | ⬜ | 3–4 days | M5 |
| M10 Borrower UI | ⬜ | 5–7 days | M9, M7 |
| M11 Lender/Officer UI | ⬜ | 5–7 days | M9, M7 |
| M12 Audit Portal | ⬜ | 3–4 days | M9, M8 |
| M13 Integration Tests | ⬜ | 5–7 days | M2–M12 |
| M14 Deployment | ⬜ | 3–5 days | M13 |

**Two milestones complete. Next to start: M2 (IdentityRegistry) and M5
(Laravel Auth) — these can begin in parallel immediately.**
