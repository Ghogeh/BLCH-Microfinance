const { expect }  = require("chai");
const { ethers }  = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

/**
 * Scenario 4 — Multi-Lender Crowdfunding (Peer-Guaranteed Disbursement)
 *
 * Dissertation reference: §3.4.3 Step 3
 * "A larger loan (e.g. 1,000,000 CFA) requested. Three lenders contribute
 *  partial amounts. The smart contract escrows funds until the total target
 *  is reached, then automatically disburses."
 *
 * Scenario 5 — Default Handling and CEMAC Enforcement
 *
 * Dissertation reference: §3.4.3 Step 6
 * "If borrower fails to repay by due date, any participant calls
 *  checkDefault(). Contract state changes to DEFAULTED. Protocol appends
 *  the wallet address to a global Blacklisted array."
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 4 — Multi-Lender Crowdfunding
// ═══════════════════════════════════════════════════════════════════════════════

describe("Scenario 4: Multi-Lender Crowdfunding", function () {

  async function crowdfundingFixture() {
    const [admin, officer, borrower, guarantor, lenderA, lenderB, lenderC] =
      await ethers.getSigners();

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

    const kycH = ethers.keccak256(ethers.toUtf8Bytes("kyc"));
    // borrower and guarantor need KYC; lenderA/B need KYC for provideGuarantee
    // (fund() has no KYC requirement but provideGuarantee() does)
    for (const w of [borrower, guarantor, lenderA, lenderB]) {
      await registry.connect(w).registerIdentity(w.address, kycH, "ROLE");
      await registry.connect(officer).verifyIdentity(w.address);
    }

    // Dissertation §3.4.3: larger loan funded by three lenders
    const LOAN_AMOUNT   = ethers.parseUnits("1000", "wei");
    const DURATION_DAYS = 90;
    const INTEREST_BPS  = 800; // 8%

    await factory.connect(borrower).createLoan(LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS);
    const loanAddr = await factory.getLoan(0);
    const loan = await ethers.getContractAt("LoanContract", loanAddr);

    // Guarantor provides peer guarantee → OPEN → FUNDING
    await loan.connect(guarantor).provideGuarantee();

    return {
      registry, acl, factory, loan,
      admin, officer, borrower, guarantor,
      lenderA, lenderB, lenderC,
      LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS,
    };
  }

  it("Three partial contributions escrow correctly before threshold", async function () {
    const { loan, lenderA, lenderB, LOAN_AMOUNT } = await loadFixture(crowdfundingFixture);

    const third = LOAN_AMOUNT / 3n;

    await loan.connect(lenderA).fund({ value: third });
    expect(await loan.getLoanState()).to.equal(1); // still FUNDING — threshold not yet met
    expect(await loan.totalFunded()).to.equal(third);

    await loan.connect(lenderB).fund({ value: third });
    expect(await loan.getLoanState()).to.equal(1); // still FUNDING (only 2/3 of target)
  });

  it("Third contribution crosses threshold — auto-disburse fires, state → ACTIVE", async function () {
    const { loan, borrower, lenderA, lenderB, LOAN_AMOUNT } =
      await loadFixture(crowdfundingFixture);

    const third  = LOAN_AMOUNT / 3n;
    const remain = LOAN_AMOUNT - (third * 2n);

    const balBefore = await ethers.provider.getBalance(borrower.address);

    await loan.connect(lenderA).fund({ value: third });
    await loan.connect(lenderB).fund({ value: third });

    // Third contribution by lenderA again (lenderC not verified — fund() is open to all)
    // The key test is that crossing the threshold triggers auto-disbursement
    await expect(loan.connect(lenderA).fund({ value: remain }))
      .to.emit(loan, "LoanDisbursed")
      .withArgs(borrower.address, LOAN_AMOUNT);

    const balAfter = await ethers.provider.getBalance(borrower.address);

    expect(await loan.getLoanState()).to.equal(2); // ACTIVE
    // Dissertation: "borrower wallet receives exactly loanAmount"
    expect(balAfter - balBefore).to.equal(LOAN_AMOUNT);
  });

  it("Overfunding: only loanAmount disbursed — excess stays in contract", async function () {
    const { loan, borrower, lenderA, LOAN_AMOUNT } = await loadFixture(crowdfundingFixture);

    const overFund  = LOAN_AMOUNT + ethers.parseUnits("200", "wei");
    const balBefore = await ethers.provider.getBalance(borrower.address);

    await loan.connect(lenderA).fund({ value: overFund });

    const balAfter = await ethers.provider.getBalance(borrower.address);

    // Borrower receives exactly loanAmount — not the overfunded amount
    expect(balAfter - balBefore).to.equal(LOAN_AMOUNT);
    // Excess 200 tokens remain in contract escrow
    expect(await ethers.provider.getBalance(await loan.getAddress()))
      .to.be.greaterThan(0n);
  });

  it("FULL SCENARIO 4: Two-lender crowdfund, full repayment cycle", async function () {
    const { loan, borrower, lenderA, lenderB, LOAN_AMOUNT } =
      await loadFixture(crowdfundingFixture);

    // Split funding between two lenders
    const half = LOAN_AMOUNT / 2n;
    await loan.connect(lenderA).fund({ value: half });
    await loan.connect(lenderB).fund({ value: LOAN_AMOUNT - half });

    expect(await loan.getLoanState()).to.equal(2); // ACTIVE after auto-disburse

    // Full repayment
    const totalRepayable = await loan.remainingBalance();
    await loan.connect(borrower).repay({ value: totalRepayable });

    expect(await loan.getLoanState()).to.equal(3); // REPAID
    // Dissertation: credit score improves after successful repayment
    expect(await loan.reputationScore()).to.be.greaterThan(50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 5 — Default Handling and Regulatory Enforcement
// ═══════════════════════════════════════════════════════════════════════════════

describe("Scenario 5: Default Handling and Regulatory Enforcement", function () {

  async function activeShortLoanFixture() {
    const [admin, officer, borrower, lender] = await ethers.getSigners();

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

    const kycH = ethers.keccak256(ethers.toUtf8Bytes("kyc"));
    for (const w of [borrower, lender]) {
      await registry.connect(w).registerIdentity(w.address, kycH, "ROLE");
      await registry.connect(officer).verifyIdentity(w.address);
    }

    // Short loan: 7-day duration so we can simulate past-due quickly in tests
    const LOAN_AMOUNT   = ethers.parseUnits("500", "wei");
    const DURATION_DAYS = 7;
    const INTEREST_BPS  = 1000;

    await factory.connect(borrower).createLoan(LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS);
    const loanAddr = await factory.getLoan(0);
    const loan = await ethers.getContractAt("LoanContract", loanAddr);
    await loan.connect(lender).provideGuarantee();
    await loan.connect(lender).fund({ value: LOAN_AMOUNT });

    expect(await loan.getLoanState()).to.equal(2); // ACTIVE

    return {
      registry, acl, factory, loan,
      admin, officer, borrower, lender,
      LOAN_AMOUNT, DURATION_DAYS,
    };
  }

  it("checkDefault reverts before due date", async function () {
    const { loan } = await loadFixture(activeShortLoanFixture);

    await expect(loan.checkDefault())
      .to.be.revertedWith("LoanContract: loan is not yet overdue");
  });

  it("checkDefault transitions ACTIVE → DEFAULTED after due date (< 90 days = no blacklist)", async function () {
    const { loan, registry, borrower } = await loadFixture(activeShortLoanFixture);

    // Advance 8 days (1 day past 7-day term, well under 90-day CEMAC threshold)
    await time.increase(8 * 24 * 60 * 60);
    await loan.checkDefault();

    expect(await loan.getLoanState()).to.equal(4); // DEFAULTED
    // Under 90 days overdue — CEMAC blacklist NOT triggered
    expect(await registry.blacklisted(borrower.address)).to.be.false;
  });

  it("90-day overdue default triggers CEMAC blacklist via factory callback", async function () {
    const { loan, registry, borrower } = await loadFixture(activeShortLoanFixture);

    // 7 (duration) + 91 (overdue) = 98 days → daysOverdue=91 >= CEMAC_THRESHOLD_DAYS(90)
    await time.increase(98 * 24 * 60 * 60);
    await loan.checkDefault();

    // Dissertation: "addresses added to global Blacklisted array,
    // blocking any further requestLoan() calls"
    expect(await registry.blacklisted(borrower.address)).to.be.true;
    expect(await loan.getLoanState()).to.equal(4); // DEFAULTED
  });

  it("Any consortium member can call checkDefault — not just the lender", async function () {
    const { loan, admin } = await loadFixture(activeShortLoanFixture);

    await time.increase(8 * 24 * 60 * 60);

    // Admin (neither lender nor borrower) can trigger default check
    await expect(loan.connect(admin).checkDefault()).to.not.be.reverted;
    expect(await loan.getLoanState()).to.equal(4); // DEFAULTED
  });

  it("Regulator can manually trigger CEMAC penalty on ACTIVE loan (before 90-day auto)", async function () {
    const { loan, registry, borrower, acl, admin } =
      await loadFixture(activeShortLoanFixture);

    // Assign REGULATOR role to admin wallet
    const REGULATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REGULATOR"));
    await acl.connect(admin).assignRole(admin.address, REGULATOR_ROLE);

    // Advance 8 days (past due date but under 90-day auto-blacklist threshold)
    await time.increase(8 * 24 * 60 * 60);
    // NOTE: do NOT call checkDefault() — triggerRegulatoryPenalty() requires ACTIVE state.
    // A regulator can independently enforce CEMAC before the 90-day auto-trigger fires.

    await loan.connect(admin)
      .triggerRegulatoryPenalty("Manual COBAC intervention: fraud detected");

    // triggerRegulatoryPenalty sets DEFAULTED and calls requestBlacklist
    expect(await loan.getLoanState()).to.equal(4); // DEFAULTED
    expect(await registry.blacklisted(borrower.address)).to.be.true;
  });

  it("FULL SCENARIO 5: Default → CEMAC blacklist → blocked from new loan network-wide", async function () {
    const { loan, registry, factory, borrower, LOAN_AMOUNT } =
      await loadFixture(activeShortLoanFixture);

    // Advance past 90-day CEMAC threshold
    await time.increase(98 * 24 * 60 * 60);
    await loan.checkDefault();

    // Borrower is blacklisted network-wide
    expect(await registry.blacklisted(borrower.address)).to.be.true;
    expect(await loan.getLoanState()).to.equal(4); // DEFAULTED

    // Dissertation: "further requestLoan() calls rejected network-wide"
    // After blacklisting, isVerified() returns false (checks !blacklisted internally),
    // so the KYC gate fires before the explicit blacklist gate in createLoan().
    await expect(
      factory.connect(borrower).createLoan(LOAN_AMOUNT, 30, 1000)
    ).to.be.revertedWith("LoanFactory: borrower not KYC verified");
  });
});
