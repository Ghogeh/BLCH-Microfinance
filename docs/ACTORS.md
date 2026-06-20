# EDL System Actors

## Actor 1 — Entrepreneur (Borrower)
**Database role value:** entrepreneur
**Solidity constant:** Roles.ENTREPRENEUR = keccak256("ENTREPRENEUR")
**Laravel middleware:** role:entrepreneur
**React guard:** RequireRole role="ENTREPRENEUR"

**Responsibilities:**
- Create a decentralised identity (DID) and submit KYC documents
- Request loans by specifying amount, duration, and interest rate
- Invite group members to provide peer guarantees
- Submit weekly/monthly repayments
- Grant or revoke lender access to repayment history
- Build a portable on-chain credit reputation

**Permitted smart contract calls:**
- IdentityRegistry: registerIdentity()
- LoanContract: provideGuarantee() (on OTHER borrowers' loans), repay(), grantLenderAccess(), revokeLenderAccess()
- LoanFactory: createLoan()

**Forbidden:**
- Cannot fund their own loan
- Cannot call disburse() directly (it is internal)
- Cannot verify KYC (that is MFI_OFFICER only)
- Cannot access the audit portal

---

## Actor 2 — Lender (MFI / SACCO / Individual Investor)
**Database role value:** lender
**Solidity constant:** Roles.LENDER = keccak256("LENDER")
**Laravel middleware:** role:lender
**React guard:** RequireRole role="LENDER"

**Responsibilities:**
- Fund loan requests by contributing ETH/tokens to the escrow
- Review borrower credit passport (with consent)
- Monitor funded loan portfolio
- Participate in consortium governance

**Permitted smart contract calls:**
- LoanContract: fund(), getRepaymentHistory() (with borrower consent)
- View functions: getLoanState(), getTotalFunded(), getGuarantors()

**Forbidden:**
- Cannot repay a loan on behalf of a borrower
- Cannot approve KYC
- Cannot access cross-institution audit without regulator role
- Cannot self-fund a loan where they are also a guarantor

---

## Actor 3 — MFI Officer
**Database role value:** officer
**Solidity constant:** Roles.MFI_OFFICER = keccak256("MFI_OFFICER")
**Laravel middleware:** role:officer
**React guard:** RequireRole role="MFI_OFFICER"

**Responsibilities:**
- Review off-chain KYC documents uploaded by entrepreneurs
- Call verifyIdentity() or rejectIdentity() on IdentityRegistry
- Approve or reject loan applications
- Monitor MFI institution portfolio

**Permitted smart contract calls:**
- IdentityRegistry: verifyIdentity(), rejectIdentity()
- View functions: all public view functions

**Forbidden:**
- Cannot fund loans using institution funds through this role (separate lender account)
- Cannot alter transaction history
- Cannot access cross-institution audit (regulator-only)
- All actions produce immutable on-chain events

---

## Actor 4 — Regulator (COBAC / BEAC)
**Database role value:** regulator
**Solidity constant:** Roles.REGULATOR = keccak256("REGULATOR")
**Laravel middleware:** role:regulator
**React guard:** RequireRole role="REGULATOR"

**Responsibilities:**
- Real-time read-only audit across the FULL consortium ledger
- Verify Merkle root consistency per block
- Detect over-indebtedness and double-dipping across institutions
- Enforce the 2026 CEMAC Blacklisting Regulation
- Call triggerRegulatoryPenalty() when manual intervention is needed

**Permitted smart contract calls:**
- ALL view/pure functions across all contracts
- IdentityRegistry: getIdentityForAudit()
- LoanContract: getRepaymentHistoryRegulator() (NO consent required), triggerRegulatoryPenalty()

**Special notes:**
- Does NOT go through standard KYC flow (institutional node)
- Read-only EXCEPT for triggerRegulatoryPenalty()
- Operates a dedicated validator node in the consortium

---

## Actor 5 — Guarantor (Peer Group Member)
**Database role value:** entrepreneur (a guarantor is also an entrepreneur)
**Solidity constant:** Roles.GUARANTOR = keccak256("GUARANTOR")
**Laravel middleware:** role:entrepreneur (same table row, dual role in Solidity)
**React guard:** RequireRole role="GUARANTOR"

**Responsibilities:**
- Digitally sign joint liability for another borrower's loan
- Stake community standing in the n-of-m quorum system
- View group loan status

**Permitted smart contract calls:**
- LoanContract: provideGuarantee() (on other borrowers' loans only)
- View functions for group loan monitoring

**Important constraint:**
- An entrepreneur and guarantor can be the SAME wallet address
  (you can be a borrower in one group and a guarantor in another)
- You CANNOT guarantee your OWN loan (contract enforces this)
- Your stake is locked until the loan reaches REPAID state

---

## Actor 6 — Admin (Consortium Deployer)
**Database role value:** admin
**Solidity constant:** Roles.ADMIN = keccak256("ADMIN")
**Laravel middleware:** role:admin
**React guard:** RequireRole role="ADMIN"

**Responsibilities:**
- Deploy and upgrade smart contracts
- Manage consortium node membership (add/remove MFIs)
- Assign and revoke roles for all other actors
- Execute blacklistAndStripRoles() when institutional action required
- Emergency pause contracts via Pausable pattern

**Permitted smart contract calls:**
- ALL functions on ALL contracts
- EDLAccessControl: assignRole(), revokeRoleFromWallet(), blacklistAndStripRoles()
- LoanContract: pause(), unpause()

**Security note:**
- Admin private key must be stored in hardware wallet in production
- NEVER assigned to an entrepreneur, lender, or guarantor wallet
- Multi-sig recommended for production (3-of-5 consortium keys)
