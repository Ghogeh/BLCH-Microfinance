# EDL Software Requirements Specification (SRS)
Version 1.0 | Derived from dissertation §3.4 and Chapter 4

---

## FUNCTIONAL REQUIREMENTS

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-001 | User registers with wallet address; Laravel generates SHA-256 hash of KYC documents; hash committed to IdentityRegistry.sol; raw docs stored off-chain | HIGH | registerIdentity() emits IdentityRegistered event; SHA-256 hash matches PHP hash('sha256', file) |
| FR-002 | MFI Officer reviews off-chain docs and calls verifyIdentity(wallet); status Pending→Verified | HIGH | Only MFI_OFFICER role can call verifyIdentity; status in identities mapping changes to Verified |
| FR-003 | Verified borrower calls createLoan(amount, duration, interest); LoanFactory deploys new LoanContract; state=OPEN | HIGH | LoanCreated event emitted; contract address stored in MySQL loans table |
| FR-004 | Group member calls provideGuarantee(loanId); n-of-m quorum; state OPEN→FUNDING | HIGH | GuaranteeProvided event emitted; guarantors[] array updated; blacklisted address reverts |
| FR-005 | Lender calls fund(); contract escrows ETH; auto-disburses when totalFunded >= loanAmount | HIGH | Funded event emitted; LoanDisbursed fires atomically; state→ACTIVE; nonReentrant prevents double-disburse |
| FR-006 | disburse() executes atomically; transfers loanAmount to borrower address; state→ACTIVE | HIGH | State transition precedes ETH transfer (checks-effects-interactions); LoanDisbursed emitted |
| FR-007 | Borrower calls repay(); remainingBalance reduced; RepaymentMade emitted; state→REPAID at zero | HIGH | Repayment stored in repaymentHistory[]; balance cannot increase during ACTIVE state |
| FR-008 | updateReputationScore() called inline with repay(); formula uses on-time count, volume, days late | HIGH | ReputationUpdated emitted in same tx block as RepaymentMade; score stored on-chain |
| FR-009 | checkDefault() compares block.timestamp to dueDate; state→DEFAULTED if overdue | HIGH | Any consortium member can call; reverts if not overdue; DefaultDeclared emitted |
| FR-010 | 90-day default triggers CEMAC 2026 blacklisting; wallet added to blacklisted mapping; future loans blocked | HIGH | blacklistAddress() called from LoanContract; AddressBlacklisted emitted; requestLoan() reverts for address |
| FR-011 | Lender calls getRepaymentHistory() with borrower consent; cross-institution credit passport | HIGH | Reverts without consent; consent stored in lenderConsent mapping; consent can be revoked |
| FR-012 | COBAC node queries event logs and view functions with zero gas; Merkle root verifiable | HIGH | getRepaymentHistoryRegulator() callable without consent; only REGULATOR role |
| FR-013 | Borrowers form groups off-chain; contract tracks guarantors[]; enforces n-of-m quorum | MEDIUM | Group membership validated against IdentityRegistry; duplicate guarantors rejected |
| FR-014 | Strict state machine: OPEN→FUNDING→ACTIVE→REPAID/DEFAULTED; no backward transitions | HIGH | State guard modifiers revert invalid transitions; no function bypasses state check |
| FR-015 | PII and docs stored off-chain; only SHA-256 hashes and state committed to ledger | HIGH | Zero PII bytes on-chain; privacy_audit_log records every pre-flight check |
| FR-016 | Borrower dashboard: credit score, active loan state, repayments, grant/revoke access | MEDIUM | React Query fetches from /api/loans and /api/users/me/credit-score |
| FR-017 | Lender/Officer dashboard: portfolio, KYC queue, approval queue, credit passport viewer | MEDIUM | Role-based route guards; officer sees KYC queue; lender sees fundable loans |
| FR-018 | Event-driven notifications: Laravel Queue listens for LoanCreated/RepaymentMade/DefaultDeclared | LOW | Events processed within queue worker poll interval; notification stored in DB |

---

## NON-FUNCTIONAL REQUIREMENTS

| ID | Requirement | Measurable Target | Enforcement |
|---|---|---|---|
| NFR-001 | Transparency — all events verifiable by consortium without central permission | 100% event log completeness; getLoanState() callable by any node | On-chain events; no private state variables for audit-relevant data |
| NFR-002 | Security / Data Integrity — tamper-proof; SHA-256 anchoring; RBAC | Zero unauthorized state mutations; hash verification 100% pass rate | nonReentrant; state machine guards; DB trigger prevents backward state |
| NFR-003 | Availability — no single point of failure | >99.5% uptime across 3+ consortium nodes | Permissioned multi-node Besu; Redis queue failover |
| NFR-004 | Performance — mobile-first confirmation time | <5 seconds block confirmation on Ganache/PoA | Ganache 1-sec block times; Besu PoA 2-sec target |
| NFR-005 | Usability — low digital literacy users | Future SUS score ≥70; USSD fallback architecture | Mobile-responsive React; simplified transaction signing |
| NFR-006 | Regulatory Compliance — COBAC + CEMAC 2026 | Automated blacklist trigger <1 block after 90-day default | triggerRegulatoryPenalty() in LoanContract; DB trigger mirrors |
| NFR-007 | Cost Efficiency — permissioned network near-zero gas | Monthly cost <USD 50 per MFI institution | Besu PoA fixed-cost consensus; no gas auctions |
| NFR-008 | Scalability — multi-MFI consortium | ≥100 TPS on Besu production network | Hardhat load test; Besu IBFT2 consensus |
| NFR-009 | Privacy — zero PII on-chain | 0 bytes PII written to ledger; AES-256 off-chain | privacy_audit_log; DB constraint; pre-flight check procedure |
| NFR-010 | Auditability — continuous real-time ledger audit | Merkle root verification <1 sec; no manual data requests | COBAC validator node; merkle_root_cache table |
