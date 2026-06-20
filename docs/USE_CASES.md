# EDL Use Case Specifications

## Use Case Index

| ID | Name | Primary Actor | Status |
|---|---|---|---|
| UC-001 | Register and verify identity | Entrepreneur | Defined |
| UC-002 | Request a loan | Entrepreneur | Defined |
| UC-003 | Provide peer guarantee | Guarantor | Defined |
| UC-004 | Fund a loan | Lender | Defined |
| UC-005 | Automatic loan disbursement | Smart Contract | Fully specified |
| UC-006 | Repay an instalment | Entrepreneur | Defined |
| UC-007 | Detect and flag default | Smart Contract / Any member | Defined |
| UC-008 | Verify borrower credit history | Lender | Defined |
| UC-009 | Regulatory audit | Regulator | Defined |
| UC-010 | CEMAC blacklisting | Smart Contract | Defined |

---

## UC-001 — Register and Verify Identity

**Primary Actor:** Entrepreneur
**Preconditions:** User has a MetaMask wallet and physical ID document
**Postconditions:** Wallet is KYC-verified in IdentityRegistry.sol; SHA-256 hash on-chain

**Main Flow:**
1. User connects MetaMask wallet on the React registration page
2. User fills in name, phone, email, role (entrepreneur) and uploads KYC document (PDF/JPG max 5MB)
3. Laravel backend receives the upload:
   a. Validates file type and size
   b. Generates SHA-256 hash of the document bytes: hash('sha256', file_contents)
   c. Stores encrypted document in off-chain storage
   d. Calls BlockchainService→registerIdentity(wallet_address, sha256_hash, "ENTREPRENEUR")
   e. IdentityRegistry.sol emits IdentityRegistered event; status = Pending
4. User sees "KYC Pending — awaiting MFI officer review" on dashboard
5. MFI Officer receives notification in officer panel
6. MFI Officer reviews off-chain document and calls verifyIdentity(wallet_address)
7. IdentityRegistry.sol emits IdentityVerified; status = Verified
8. User dashboard updates: "KYC Verified — you can now request loans"
9. Laravel updates users.kyc_status = 'verified' and records in audit_log

**Key constraint:** Steps 1–5 happen in a single user session.
Step 6–9 happen asynchronously (minutes to hours later).

---

## UC-002 — Request a Loan

**Primary Actor:** Entrepreneur
**Preconditions:** UC-001 complete; user.kyc_status = verified; user not blacklisted
**Postconditions:** LoanContract deployed; state = OPEN; LoanCreated event on-chain

**Main Flow:**
1. Entrepreneur navigates to /loans/new
2. Fills loan request form: amount (CFA 50,000–500,000), duration (days), interest rate, group members
3. React validates: amount within bounds, duration reasonable, interest ≤ 30%
4. User clicks "Submit Loan Request" — MetaMask popup appears to sign
5. Frontend calls: LoanFactory.createLoan(amount, duration, interestBps, registryAddress)
6. LoanFactory deploys new LoanContract instance; emits LoanCreated
7. Laravel event listener catches LoanCreated; inserts into loans table with state = OPEN
8. Borrower dashboard shows new loan card with state badge "OPEN"
9. Invited group members receive notification to provide guarantees

---

## UC-006 — Repay an Instalment

**Primary Actor:** Entrepreneur (borrower of this specific loan)
**Preconditions:** loan.state = ACTIVE; msg.sender = borrower address; payment > 0
**Postconditions:** remainingBalance reduced; ReputationUpdated emitted; state→REPAID if balance=0

**Main Flow:**
1. Borrower navigates to /loans/:id/repay
2. Dashboard shows: outstanding balance, instalment amount, due date, penalty countdown
3. Borrower enters payment amount (validated: must be ≤ remainingBalance)
4. MetaMask popup shows gas estimate (near-zero on Ganache/Besu)
5. Borrower signs transaction; LoanContract.repay{value: amount}() called
6. Smart contract executes atomically in one block:
   a. Validates state == ACTIVE and msg.sender == borrower
   b. remainingBalance -= msg.value
   c. Appends RepaymentEntry to repaymentHistory[]
   d. Calls _updateReputationScore() inline
   e. Emits RepaymentMade + ReputationUpdated
   f. If remainingBalance == 0: state = REPAID
7. Laravel listener catches RepaymentMade:
   a. Inserts into repayments table
   b. Updates credit_scores table
   c. Sends notification: "Payment confirmed on block #N"
8. Borrower dashboard: balance decreases; credit score gauge animates upward

---

## UC-009 — Regulatory Audit

**Primary Actor:** Regulator (COBAC/BEAC validator node)
**Preconditions:** Caller holds REGULATOR role; not blacklisted
**Postconditions:** No state changes; full ledger history verified; anomalies flagged

**Main Flow:**
1. COBAC officer logs into Regulator Audit Portal (/audit)
2. Portal loads all loans via: GET /api/audit/loans (role:regulator middleware)
3. Officer selects a borrower to audit
4. Portal calls: getRepaymentHistoryRegulator() — no consent required; zero gas
5. Portal displays: full repayment timeline, state transitions, guarantor list
6. Officer clicks "Verify Merkle Root" for block N
7. Backend calls: AuditController→verifyMerkle(blockNumber)
8. Smart contract recomputes block hash; compares with merkle_root_cache
9. If mismatch → "TAMPER DETECTED" alert; audit log entry created
10. If overdue loan found → Officer can call triggerRegulatoryPenalty(reason)
11. All audit actions appended to audit_log table (immutable)
