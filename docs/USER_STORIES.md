# EDL User Stories

## Entrepreneur Stories

US-E01 | As an entrepreneur, I want to connect my MetaMask wallet on first visit,
so that I can create a blockchain identity without remembering a password.
Acceptance: WalletConnectButton detects MetaMask; prompts install if absent;
displays truncated address (0x1234...5678) after connection.

US-E02 | As an entrepreneur, I want to upload my KYC documents from my phone,
so that I can register without visiting an MFI branch.
Acceptance: react-dropzone accepts PDF/JPG ≤5MB; shows upload progress;
displays SHA-256 hash after upload so I can verify it matches what went on-chain.

US-E03 | As an entrepreneur, I want to see my credit score on my dashboard,
so that I know how lenders perceive my repayment history.
Acceptance: RadialBarChart shows 0–100 score; colour green ≥70, amber 40–69,
red <40; score updates after each confirmed repayment.

US-E04 | As an entrepreneur, I want to request a loan by specifying amount and duration,
so that I can get funding without collateral.
Acceptance: Form validates CFA 50,000 minimum; shows interest total before submit;
MetaMask confirmation shows estimated gas cost.

US-E05 | As an entrepreneur, I want to invite group members to guarantee my loan,
so that I can qualify for peer-guaranteed credit.
Acceptance: Group member search by wallet address; notification sent to invitees;
loan card shows guarantee progress (e.g. "2 of 3 guarantees received").

US-E06 | As an entrepreneur, I want to repay an instalment from my dashboard,
so that I can build my credit score without visiting a branch.
Acceptance: Outstanding balance shown; repayment amount validated ≤ balance;
confirmation screen shows new balance after payment; toast notification on success.

US-E07 | As an entrepreneur, I want to grant a specific lender access to my repayment history,
so that I can share my credit passport when applying for a new loan.
Acceptance: "Grant Access" button shows list of verified lenders; one-click grant;
revoke available at any time; granted lenders shown with date.

---

## Lender Stories

US-L01 | As a lender, I want to browse open loan requests with borrower credit scores,
so that I can fund creditworthy entrepreneurs.
Acceptance: LoanBrowser shows all FUNDING-state loans; filterable by amount and score;
borrower credit score visible if consent granted.

US-L02 | As a lender, I want to fund a loan with a single MetaMask transaction,
so that I can contribute without complex bank transfers.
Acceptance: FundButton shows current funding progress (e.g. 65%); enters ETH amount;
MetaMask confirms; Funded event confirmed on-chain before UI updates.

US-L03 | As a lender, I want to view the repayment history of a borrower I have funded,
so that I can monitor portfolio risk.
Acceptance: RepaymentHistoryTable shows all entries with tx hash; each hash is a
clickable link to Ganache/Besu block explorer.

---

## MFI Officer Stories

US-O01 | As an MFI officer, I want to see a queue of pending KYC submissions,
so that I can process verifications efficiently.
Acceptance: KYCQueue sorted by submission date (oldest first); shows borrower
name, document type, submission time; one-click Verify or Reject buttons.

US-O02 | As an MFI officer, I want to reject a KYC submission with a reason,
so that the borrower knows what to resubmit.
Acceptance: Reject opens a modal with required reason field; reason stored in
kyc_documents.rejection_reason; borrower notified immediately.

---

## Regulator Stories

US-R01 | As a COBAC regulator, I want to view all loans across all MFIs in real time,
so that I can detect over-indebtedness without requesting reports.
Acceptance: AuditPortal loads all loans regardless of institution; filterable by
state, date range, borrower; no consent required from any MFI.

US-R02 | As a COBAC regulator, I want to verify the Merkle root of any block,
so that I can confirm no transaction records have been tampered with.
Acceptance: Block number input; VerifyButton calls AuditController→verifyMerkle();
shows VERIFIED (green) or TAMPER DETECTED (red); result appended to audit_log.
