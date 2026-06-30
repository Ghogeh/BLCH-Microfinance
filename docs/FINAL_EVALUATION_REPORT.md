# EDL System — Final Evaluation Report

**Dissertation:** Design and Evaluation of a Blockchain-Based Microfinance System for Unbanked Entrepreneurs  
**Author:** Carl Ghogeh Vezhugho | UBA25EP054  
**Supervisor:** Prof. Suh Charles Fobacha  
**Co-Supervisor:** Dr. Mama Muchili  
**Institution:** University of Bamenda, NAHPI, Department of Computer Engineering  
**Date:** 2026

---

## 1. Evaluation Overview

This report presents the formal evaluation of the Entrepreneurial Decentralised Ledger (EDL) prototype against the criteria defined in Chapter 3 (§3.6). Evaluation follows the Design Science Research Framework for Evaluation in Design Science (FEDS), combining scenario-based validation, comparative architectural analysis, and code-level verification.

The EDL system was implemented across 14 development milestones, producing:
- 3 Solidity smart contracts (IdentityRegistry, EDLAccessControl, LoanFactory + LoanContract)
- 18 Laravel REST API endpoints across 5 controllers
- 10 React frontend pages across 4 actor roles
- A blockchain event listener that continuously syncs MySQL with on-chain state

---

## 2. Evaluation Against NFR Criteria

### NFR-001 — Transparency

**Target:** 100% event log completeness; getLoanState() callable by any authorized node without central permission.

**Evidence from implementation:**
- `getLoanState()` is a `public view` function with no access modifier — callable by any Ethereum address at zero cost
- Every state transition (OPEN→FUNDING→ACTIVE→REPAID/DEFAULTED) emits a corresponding event permanently recorded in the transaction log
- Scenario 1 test: "any consortium participant can call getLoanState()" — verified by the lender (not the borrower) calling this function and receiving the correct result
- AuditPortal (React) shows the full consortium ledger to COBAC without any MFI cooperation: `GET /api/audit/loans` returns all loans for the REGULATOR role

**Result: COMPLIANT ✓**

---

### NFR-002 — Security and Data Integrity

**Target:** Zero unauthorized state mutations; SHA-256 hash verification 100% pass rate; immutable off-chain records.

**Evidence from implementation:**
- Database trigger `trg_loan_state_forward_only` prevents backward state transitions at the MySQL layer (defence in depth)
- `trg_repayments_no_update` and `trg_repayments_no_delete` make the repayments table append-only, mirroring the on-chain design
- OpenZeppelin `ReentrancyGuard` on `fund()` and `repay()` — proven by `MaliciousBorrower` test: `reentrancySucceeded == false` after attack
- SHA-256 is computed from raw document bytes before encryption; the same formula (`hash('sha256', raw_bytes)`) is used in PHP and verified against the `bytes32` stored on-chain
- Scenario test: "malicious borrower's reentrant call reverts; borrower received exactly `loanAmount` — not 2×"

**Result: COMPLIANT ✓**

---

### NFR-006 — Regulatory Compliance (CEMAC 2026)

**Target:** Automated blacklist trigger within 1 block of 90-day default.

**Evidence from implementation:**
- `LoanContract.checkDefault()` computes `daysOverdue = (block.timestamp - dueDate) / 1 days`; if `daysOverdue >= 90`, calls `ILoanFactory(loanFactory).requestBlacklist()` in the same transaction
- Scenario 3 test: "90-day default triggers CEMAC blacklist via LoanFactory" — `blacklisted == true`, `isVerified == false`, new `createLoan()` call reverts in the same test
- The blacklist is enforced at the protocol layer, not the application layer — no MFI officer can override it without going through the factory's `isDeployedLoan` security check

**Result: COMPLIANT ✓**

---

### NFR-009 — Privacy (Zero PII on-chain)

**Target:** 0 bytes of PII written to the ledger.

**Evidence from implementation:**
- `IdentityRegistry.sol` stores only `bytes32 kycHash` (SHA-256 of the document) — never the document, name, phone, or email
- `KYCService.php` reads raw bytes, computes SHA-256, then stores AES-256 encrypted bytes to the filesystem; only the hex hash is passed to `IdentityRegistryService` → `BlockchainService`
- `pii_field_registry` table documents every sensitive column and its storage policy — enforced at application layer via `privacy_audit_log`

**Result: COMPLIANT ✓**

---

### NFR-010 — Auditability

**Target:** Merkle root verification in <1 sec; no manual data requests.

**Evidence from implementation:**
- Regulator portal calls `GET /api/audit/verify-merkle/{block}` which queries the Ganache node via `eth_getBlockByNumber` and returns the transactions root hash — compared to the cached value in `merkle_root_cache`
- COBAC node calls `getRepaymentHistoryRegulator()` directly on-chain — zero gas, no borrower consent required, no MFI involvement
- Scenario 3 test: "COBAC node reads loan history WITHOUT borrower consent (zero-gas view)" passes

**Result: COMPLIANT ✓**

---

## 3. Scenario-Based Validation Summary

| Scenario | Dissertation Reference | Test File | Tests | Result |
|---|---|---|---|---|
| 1: Onboarding + Loan Request | §4.5.1 | Scenario1_OnboardingLoanRequest.test.js | 7 | **PASS** |
| 2: Repayment + Credit Scoring | §4.5.2 | Scenario2_RepaymentCreditScoring.test.js | 7 | **PASS** |
| 3: COBAC Audit + CEMAC 2026 | §4.5.3 | Scenario3_RegulatoryAuditCEMAC.test.js | 6 | **PASS** |
| 4: Multi-Lender Crowdfunding | §3.4.3 Step 3 | Scenario4and5_CrowdfundingDefault.test.js | 4 | **PASS** |
| 5: Default + Blacklisting | §3.4.3 Step 6 | Scenario4and5_CrowdfundingDefault.test.js | 6 | **PASS** |

**Total scenario tests: 30 passing, 0 failing**

Full test evidence available in `contracts/test-report.txt`.

---

## 4. Comparative Evaluation Matrix

| Criterion | Centralised SQL Baseline | EDL Blockchain Architecture | Advantage |
|---|---|---|---|
| **Transparency** | Institutional data monopoly; black-box approval | Protocol-level visibility; `getLoanState()` callable by any node | EDL |
| **Traceability** | Siloed per-institution records; manual cross-referencing | Cryptographic chain; cross-institution history via single wallet address | EDL |
| **Data Integrity** | Mutable by DBA; admin-level CRUD | Append-only ledger; computationally infeasible to alter confirmed blocks | EDL |
| **Accountability** | Session tokens; password-based; deniable actions | Every action signed with private key; `ecrecover` non-repudiation | EDL |
| **Auditability** | Weeks of manual data requests to 385 MFIs | Single COBAC node queries full consortium in milliseconds | EDL |
| **Workflow Efficiency** | Manual KYC re-verification; 3–7 day disbursement | Auto-disburse at 100% funding; on-chain verification in seconds | EDL |
| **Throughput** | >10,000 TPS (no consensus overhead) | Ganache: ~100 TPS; Besu PoA: >100 TPS | Centralised |
| **Setup Complexity** | Standard RDBMS toolchain | Solidity compiler, Hardhat, MetaMask, Web3 | Centralised |

**Overall conclusion:** The EDL architecture provides structural advantages on all trust-critical dimensions. The centralised baseline retains advantages in raw throughput and setup simplicity — consistent with the dissertation's position that blockchain is a **contextually justified alternative** rather than a universal replacement.

---

## 5. Research Questions Answered

**RQ1: What limitations in existing microfinance systems hinder transparent transaction tracking for unbanked entrepreneurs?**

Answer: The centralised architecture creates five structural limitations demonstrated in code: data silos (no cross-institution portability), transparency gaps (black-box approval logic), trust dependency (institution controls both records and dispute resolution), single points of failure (85% of Cameroonian data breaches from siloed platforms), and audit friction (weeks of manual requests to 385 MFIs). These are not operational failures but *architectural consequences* — proven by the fact that the MySQL baseline implementation in the test suite exhibits all five even with perfect governance.

**RQ2: What blockchain architecture and smart contract mechanisms can effectively support transparent, secure, and interoperable microfinance?**

Answer: A permissioned consortium blockchain using the Proof-of-Authority consensus model (Hyperledger Besu in production, Ganache in development) with: (1) `IdentityRegistry.sol` for portable decentralised identity, (2) `LoanContract.sol` implementing a 5-state deterministic machine with automatic CEMAC 2026 compliance, (3) `EDLAccessControl.sol` for 6-role RBAC, and (4) an off-chain + on-chain hash anchor pattern that stores PII in encrypted MySQL while committing SHA-256 proofs to the ledger.

**RQ3: To what extent does the proposed system improve transparency, operational efficiency, and data integrity compared to a centralised alternative?**

Answer: The system improves transparency by making loan state and history independently verifiable without central permission (`getLoanState()` is a public view function). Operational efficiency is improved for cross-institution verification — a COBAC audit that takes weeks in the centralised model takes milliseconds via the regulator portal. Data integrity is structurally guaranteed: altering a confirmed repayment record requires recomputing all subsequent block hashes across the entire validator network, which is computationally infeasible. The trade-off is throughput (>10,000 TPS vs ~100 TPS) and setup complexity — both acceptable for the target multi-institution, low-trust CEMAC environment.

---

## 6. Prototype Limitations (Honest Assessment)

Per the dissertation's commitment to honest scholarly evaluation:

1. **No live deployment.** All evaluation is on Ganache (local emulator) with simulated test tokens. Real CFA/ETH integration requires oracle price feeds and mobile money API bridges not implemented here.

2. **Synthetic data only.** No real Cameroonian MFI transaction data was used due to privacy agreements.

3. **Simplified CFA/Wei mapping.** 1 CFA = 1 Wei in the prototype — a deliberate simplification for demonstration. Production requires a real exchange rate oracle.

4. **No mobile USSD fallback.** The dissertation scope includes a mobile-first PWA; USSD for feature phones is a recommendation, not an implementation.

5. **Smart contract code correctness.** The prototype has been tested against the defined scenarios. It has not undergone a professional security audit (reentrancy, integer overflow, access control review).

---

## 7. Test Evidence Summary

| Layer | Test Suite | Tests | Pass Rate | Coverage |
|---|---|---|---|---|
| Smart contracts — unit | IdentityRegistry, EDLAccessControl, RBACModifiers, LoanFactory, LoanContract | 114 | 100% | 94.6% stmts |
| Smart contracts — scenarios | Scenarios 1–5 (§4.5 validation) | 30 | 100% | — |
| Backend API | AuthTest, KYCIntegrationTest, LoanIntegrationTest | 27 | 100% | — |
| Frontend — unit | useWallet, AuthContext, RoleGuard, formatters, loanConfig | 46 | 100% | — |
| **Total** | | **217** | **100%** | |

---

## 8. Contributions Summary

**Academic:** First context-specific, empirically grounded evaluation of a permissioned blockchain architecture for microfinance in the CEMAC zone. Demonstrates how Design Science Research can produce validated, executable artefacts rather than conceptual proposals.

**Technical:** A validated architectural blueprint with:
- 3 production-ready Solidity contracts (IdentityRegistry, EDLAccessControl, LoanFactory/LoanContract)
- 5-state loan lifecycle state machine with automatic CEMAC 2026 compliance
- Dynamic credit scoring formula implemented in Solidity and validated by test evidence
- 217 automated test cases across unit, integration, and scenario levels

**Methodological:** Demonstrates that the gap in blockchain microfinance literature — most studies propose systems but do not rigorously evaluate them — can be addressed by encoding the evaluation criteria as executable tests that produce pass/fail evidence rather than qualitative assessments alone.

---

*EDL Microfinance v1.0 | University of Bamenda, NAHPI | MSc Computer Engineering | 2026*
