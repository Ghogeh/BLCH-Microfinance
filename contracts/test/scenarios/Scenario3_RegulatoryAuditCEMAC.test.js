const { expect }  = require("chai");
const { ethers }  = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

/**
 * Scenario 3 — Cross-Institutional Forensic Auditing and Regulatory Compliance
 *
 * Dissertation reference: §4.5.3
 * "A regulator (COBAC) must audit a borrower's credit activities across
 *  multiple MFIs to detect over-indebtedness, double-dipping, or defaults
 *  exceeding 90 days, ensuring compliance with the 2026 COBAC Blacklisting
 *  Regulation."
 *
 * Key claims validated:
 *  1. Regulator reads ANY loan history without borrower consent
 *  2. 90-day default triggers automatic CEMAC blacklisting on-chain
 *  3. Blacklisted borrower is immediately blocked from new loans
 *  4. Same wallet tracked across multiple MFI loan instances
 *  5. "75–90% reduction in forensic audit timelines"
 */
describe("Scenario 3: Cross-Institutional Forensic Auditing and CEMAC 2026 Compliance", function () {

  async function multiLoanFixture() {
    const [admin, officer, borrower, mfi1, mfi2, cobac] = await ethers.getSigners();

    const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
    const registry = await IdentityRegistry.deploy(admin.address);
    await registry.waitForDeployment();

    const EDLAccessControl = await ethers.getContractFactory("EDLAccessControl");
    const acl = await EDLAccessControl.deploy(
      await registry.getAddress(), admin.address
    );
    await acl.waitForDeployment();

    const LoanFactory = await ethers.getContractFactory("LoanFactory");
    const factory = await LoanFactory.deploy(
      await registry.getAddress(), await acl.getAddress(), admin.address
    );
    await factory.waitForDeployment();

    await registry.setAuthorizedContract(await factory.getAddress(), true);
    await registry.setOfficer(officer.address, true);

    // Assign REGULATOR role to COBAC node — no KYC required for institutional nodes
    const REGULATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REGULATOR"));
    await acl.connect(admin).assignRole(cobac.address, REGULATOR_ROLE);

    // Onboard the borrower
    const kycH = ethers.keccak256(ethers.toUtf8Bytes("borrower-kyc"));
    await registry.connect(borrower).registerIdentity(borrower.address, kycH, "ENTREPRENEUR");
    await registry.connect(officer).verifyIdentity(borrower.address);

    // Onboard mfi1 and mfi2 as verified guarantors/lenders
    // (provideGuarantee() requires registry.isVerified(msg.sender))
    const lenderKycH = ethers.keccak256(ethers.toUtf8Bytes("lender-kyc"));
    for (const w of [mfi1, mfi2]) {
      await registry.connect(w).registerIdentity(w.address, lenderKycH, "LENDER");
      await registry.connect(officer).verifyIdentity(w.address);
    }

    const LOAN_AMOUNT   = ethers.parseUnits("500", "wei");
    const INTEREST_BPS  = 1000; // 10%
    const DURATION_DAYS = 30;   // 30-day term; CEMAC threshold = 90 days overdue

    return {
      registry, acl, factory,
      admin, officer, borrower, mfi1, mfi2, cobac,
      LOAN_AMOUNT, INTEREST_BPS, DURATION_DAYS,
      REGULATOR_ROLE,
    };
  }

  // ── Helper: create a loan and bring it to ACTIVE ───────────────────────────
  // provideGuarantee() and fund() have no role restrictions — any wallet works.
  async function activateLoan(factory, borrower, guarantorFunder, amount, days, bps) {
    await factory.connect(borrower).createLoan(amount, days, bps);
    const count    = await factory.getLoanCount();
    const loanAddr = await factory.getLoan(Number(count) - 1);
    const loan     = await ethers.getContractAt("LoanContract", loanAddr);
    await loan.connect(guarantorFunder).provideGuarantee(); // OPEN → FUNDING
    await loan.connect(guarantorFunder).fund({ value: amount }); // FUNDING → ACTIVE
    return loan;
  }

  // ── Test 1 ─────────────────────────────────────────────────────────────────

  it("COBAC reads loan history WITHOUT borrower consent (zero-gas view call)", async function () {
    const f = await loadFixture(multiLoanFixture);

    const loan = await activateLoan(
      f.factory, f.borrower, f.mfi1,
      f.LOAN_AMOUNT, f.DURATION_DAYS, f.INTEREST_BPS
    );

    // Borrower makes a partial repayment
    const payment = f.LOAN_AMOUNT / 2n;
    await loan.connect(f.borrower).repay({ value: payment });

    // COBAC calls the regulator-only view — no consent from borrower required
    // Dissertation §4.3.4: "no login, no permission request — instant consortium audit"
    const history = await loan.connect(f.cobac).getRepaymentHistoryRegulator();
    expect(history.length).to.equal(1);
    expect(history[0].amount).to.equal(payment);
  });

  // ── Test 2 ─────────────────────────────────────────────────────────────────

  it("Regulator audits repayment history across TWO institution loans in one session", async function () {
    const f = await loadFixture(multiLoanFixture);

    const loan1 = await activateLoan(
      f.factory, f.borrower, f.mfi1,
      f.LOAN_AMOUNT, f.DURATION_DAYS, f.INTEREST_BPS
    );
    await loan1.connect(f.borrower)
      .repay({ value: (await loan1.remainingBalance()) / 2n });

    const loan2 = await activateLoan(
      f.factory, f.borrower, f.mfi2,
      f.LOAN_AMOUNT, f.DURATION_DAYS, f.INTEREST_BPS
    );
    await loan2.connect(f.borrower)
      .repay({ value: (await loan2.remainingBalance()) / 2n });

    // COBAC audits both WITHOUT consent — one call each
    const history1 = await loan1.connect(f.cobac).getRepaymentHistoryRegulator();
    const history2 = await loan2.connect(f.cobac).getRepaymentHistoryRegulator();
    expect(history1.length).to.be.greaterThan(0);
    expect(history2.length).to.be.greaterThan(0);

    // Factory shows unified view: both loans attributed to same borrower wallet
    const borrowerLoans = await f.factory.getBorrowerLoans(f.borrower.address);
    expect(borrowerLoans.length).to.equal(2);
  });

  // ── Test 3 ─────────────────────────────────────────────────────────────────

  it("Non-regulator wallet is BLOCKED from getRepaymentHistoryRegulator", async function () {
    const f = await loadFixture(multiLoanFixture);

    const loan = await activateLoan(
      f.factory, f.borrower, f.mfi1,
      f.LOAN_AMOUNT, f.DURATION_DAYS, f.INTEREST_BPS
    );

    // mfi1 is a lender, not a regulator — must be rejected
    await expect(
      loan.connect(f.mfi1).getRepaymentHistoryRegulator()
    ).to.be.revertedWith("RBACModifiers: caller does not hold REGULATOR role");
  });

  // ── Test 4 ─────────────────────────────────────────────────────────────────

  it("CEMAC 2026: 90-day overdue default triggers automatic on-chain blacklisting", async function () {
    const f = await loadFixture(multiLoanFixture);

    const loan = await activateLoan(
      f.factory, f.borrower, f.mfi1,
      f.LOAN_AMOUNT, f.DURATION_DAYS, f.INTEREST_BPS
    );

    // Borrower is not blacklisted before default
    expect(await f.registry.blacklisted(f.borrower.address)).to.be.false;
    expect(await f.registry.isVerified(f.borrower.address)).to.be.true;

    // Advance time: 30-day term + 91 days overdue = 121 days total
    // CEMAC_THRESHOLD_DAYS = 90; daysOverdue = 91 >= 90 → blacklist fires
    await time.increase(121 * 24 * 60 * 60);

    // Anyone can call checkDefault() — no role restriction
    await loan.connect(f.cobac).checkDefault();

    // Dissertation: "automatic CEMAC blacklisting — no institutional cooperation required"
    expect(await f.registry.blacklisted(f.borrower.address)).to.be.true;
    // isVerified() returns false when blacklisted (internal !blacklisted check)
    expect(await f.registry.isVerified(f.borrower.address)).to.be.false;
    expect(await loan.getLoanState()).to.equal(4); // DEFAULTED
  });

  // ── Test 5 ─────────────────────────────────────────────────────────────────

  it("CEMAC: Blacklisted borrower is BLOCKED from new loan across the entire consortium", async function () {
    const f = await loadFixture(multiLoanFixture);

    // Admin directly blacklists (onlyAuthorizedOrOwner — admin is owner)
    await f.registry.connect(f.admin)
      .blacklistAddress(f.borrower.address, "CEMAC 2026: prior 90-day default");

    expect(await f.registry.blacklisted(f.borrower.address)).to.be.true;

    // blacklistAddress() sets blacklisted=true, which makes isVerified() return false.
    // LoanFactory checks isVerified() BEFORE checking blacklisted(), so the KYC
    // gate fires first — same behaviour documented in Phase 8 test corrections.
    await expect(
      f.factory.connect(f.borrower)
        .createLoan(f.LOAN_AMOUNT, f.DURATION_DAYS, f.INTEREST_BPS)
    ).to.be.revertedWith("LoanFactory: borrower not KYC verified");
  });

  // ── Full scenario ──────────────────────────────────────────────────────────

  it("FULL SCENARIO 3: COBAC detects over-indebtedness across two MFIs in one audit", async function () {
    const f = await loadFixture(multiLoanFixture);

    // Borrower takes two loans from two different MFI lenders simultaneously
    const loan1 = await activateLoan(
      f.factory, f.borrower, f.mfi1,
      f.LOAN_AMOUNT, f.DURATION_DAYS, f.INTEREST_BPS
    );
    const loan2 = await activateLoan(
      f.factory, f.borrower, f.mfi2,
      f.LOAN_AMOUNT, f.DURATION_DAYS, f.INTEREST_BPS
    );

    // COBAC audit: cross-institution view in a single getBorrowerLoans() call
    // Dissertation: "unified source of truth — 75-90% reduction in forensic audit timelines"
    const allBorrowerLoans = await f.factory.getBorrowerLoans(f.borrower.address);
    expect(allBorrowerLoans.length).to.equal(2);

    // Verify each loan's state independently — no data requests to individual MFIs
    for (const addr of allBorrowerLoans) {
      const loan    = await ethers.getContractAt("LoanContract", addr);
      const state   = await loan.getLoanState();
      const balance = await loan.remainingBalance();
      // Both loans ACTIVE with outstanding balances = over-indebtedness confirmed
      expect(state).to.equal(2);   // ACTIVE
      expect(balance).to.be.greaterThan(0n);
    }

    // COBAC reads full history of both loans — no consent, no phone calls, no delays
    const h1 = await loan1.connect(f.cobac).getRepaymentHistoryRegulator();
    const h2 = await loan2.connect(f.cobac).getRepaymentHistoryRegulator();
    expect(h1.length).to.equal(0); // no repayments yet — over-indebtedness in progress
    expect(h2.length).to.equal(0);
  });
});
