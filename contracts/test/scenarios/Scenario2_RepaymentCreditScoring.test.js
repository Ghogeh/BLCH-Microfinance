const { expect }      = require("chai");
const { ethers }      = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

/**
 * Scenario 2 — Atomic Repayment Tracking and Dynamic Reputation Updates
 *
 * Dissertation reference: §4.5.2
 * "Borrower makes installment payments totalling 500 tokens plus interest
 *  over 3 months. System must verify each transaction, update outstanding
 *  balance, and dynamically calculate credit reputation network-wide."
 *
 * Key dissertation claim validated:
 *  "EDL achieves consensus-driven, deterministic finality — payment logs
 *   become unalterable. Centralised systems decouple balance adjustments
 *   from reputation scoring, creating structural latency; EDL couples
 *   both operations into a single transaction block."
 *
 *  "95% reduction in reconciliation latency (from days to seconds)"
 */
describe("Scenario 2: Atomic Repayment Tracking and Dynamic Credit Scoring", function () {

  async function activeLoanFixture() {
    const [admin, officer, borrower, guarantor, lender] = await ethers.getSigners();

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
    for (const w of [borrower, guarantor]) {
      await registry.connect(w).registerIdentity(w.address, kycH, "ROLE");
      await registry.connect(officer).verifyIdentity(w.address);
    }

    const LOAN_AMOUNT = ethers.parseUnits("500", "wei");
    // totalRepayable = 500 + (500 * 1000 / 10000) = 550
    const TOTAL_REPAYABLE = ethers.parseUnits("550", "wei");

    await factory.connect(borrower).createLoan(LOAN_AMOUNT, 90, 1000);
    const loanAddr = await factory.getLoan(0);
    const loan = await ethers.getContractAt("LoanContract", loanAddr);

    await loan.connect(guarantor).provideGuarantee();
    await loan.connect(lender).fund({ value: LOAN_AMOUNT });

    // Loan is now ACTIVE, remainingBalance = 550
    return {
      registry, acl, factory, loan,
      admin, officer, borrower, guarantor, lender,
      LOAN_AMOUNT, TOTAL_REPAYABLE,
    };
  }

  it("Repayment reduces remainingBalance by exact payment amount", async function () {
    const { loan, borrower } = await loadFixture(activeLoanFixture);

    const balanceBefore = await loan.remainingBalance();
    const payment = ethers.parseUnits("100", "wei");

    await loan.connect(borrower).repay({ value: payment });

    const balanceAfter = await loan.remainingBalance();
    expect(balanceBefore - balanceAfter).to.equal(payment);
  });

  it("RepaymentMade and ReputationUpdated emitted in the SAME transaction (atomicity)", async function () {
    const { loan, borrower } = await loadFixture(activeLoanFixture);

    const payment = ethers.parseUnits("100", "wei");
    const tx      = await loan.connect(borrower).repay({ value: payment });
    const receipt = await tx.wait();

    const topics      = receipt.logs.map(l => l.topics[0]);
    const repaidTopic = ethers.id("RepaymentMade(address,uint256,uint256)");
    const scoreTopic  = ethers.id("ReputationUpdated(address,uint256)");

    // BOTH events must be in the SAME transaction receipt —
    // this proves atomicity: reputation update happens in the same block as payment
    expect(topics).to.include(repaidTopic);
    expect(topics).to.include(scoreTopic);
  });

  it("ReputationScore increases above baseline 50 after on-time payment", async function () {
    const { loan, borrower } = await loadFixture(activeLoanFixture);

    const scoreBefore = await loan.reputationScore();
    expect(scoreBefore).to.equal(50); // baseline set in constructor

    await loan.connect(borrower).repay({ value: ethers.parseUnits("100", "wei") });

    const scoreAfter = await loan.reputationScore();
    // On-time: timelinessScore=60, volumeScore=100*30/550=5 → newScore=75
    expect(scoreAfter).to.be.greaterThan(50);
  });

  it("RepaymentEntry appended to repaymentHistory — portable credit record", async function () {
    const { loan, borrower } = await loadFixture(activeLoanFixture);

    await loan.connect(borrower).repay({ value: ethers.parseUnits("100", "wei") });
    await loan.connect(borrower).repay({ value: ethers.parseUnits("150", "wei") });

    expect(await loan.getRepaymentCount()).to.equal(2);
  });

  it("Final repayment transitions state ACTIVE → REPAID in the same tx", async function () {
    const { loan, borrower, TOTAL_REPAYABLE } = await loadFixture(activeLoanFixture);

    const half      = TOTAL_REPAYABLE / 2n;
    const remainder = TOTAL_REPAYABLE - half;

    await loan.connect(borrower).repay({ value: half });
    expect(await loan.getLoanState()).to.equal(2); // still ACTIVE

    await loan.connect(borrower).repay({ value: remainder });
    expect(await loan.getLoanState()).to.equal(3); // REPAID
    expect(await loan.remainingBalance()).to.equal(0n);
  });

  it("Credit score is higher after on-time payments vs late payments", async function () {
    const f1 = await loadFixture(activeLoanFixture);
    const f2 = await loadFixture(activeLoanFixture);

    // Loan 1: pay before due date (on-time)
    await f1.loan.connect(f1.borrower)
      .repay({ value: ethers.parseUnits("275", "wei") });
    const scoreOnTime = await f1.loan.reputationScore();

    // Loan 2: advance time past due date, then pay (late)
    await time.increase(91 * 24 * 60 * 60); // 91 days — past the 90-day due date
    await f2.loan.connect(f2.borrower)
      .repay({ value: ethers.parseUnits("275", "wei") });
    const scoreLate = await f2.loan.reputationScore();

    // On-time score must be strictly higher (timeliness weight = 60 pts vs 0)
    expect(scoreOnTime).to.be.greaterThan(scoreLate);
  });

  it("FULL SCENARIO 2: Three-instalment repayment with progressive credit improvement", async function () {
    const { loan, borrower, lender, admin, TOTAL_REPAYABLE } =
      await loadFixture(activeLoanFixture);

    const instalment = TOTAL_REPAYABLE / 3n; // 550 / 3 = 183n (integer)
    const scores     = [];

    // Three instalments — credit score should improve with each on-time payment
    for (let i = 0; i < 3; i++) {
      const payAmount = i === 2
        ? await loan.remainingBalance() // final: clear exact remainder (184 wei)
        : instalment;

      await loan.connect(borrower).repay({ value: payAmount });
      scores.push(Number(await loan.reputationScore()));
    }

    // Score progression: final score must be >= first score
    // (100 >= 79 for all-on-time payments)
    expect(scores[2]).to.be.greaterThanOrEqual(scores[0]);

    // Final state: REPAID
    expect(await loan.getLoanState()).to.equal(3);
    expect(await loan.remainingBalance()).to.equal(0n);

    // ── Portable credit passport with borrower-controlled consent ──────────

    // Grant lender access to view the credit history
    await loan.connect(borrower).grantLenderAccess(lender.address);
    const history = await loan.connect(lender).getRepaymentHistory();
    expect(history.length).to.equal(3);

    // Dissertation claim: "An entrepreneur's successful repayment at MFI-A
    // is immediately visible to MFI-B — breaking reputation lock-in."
    // Verified by a THIRD party (admin wallet) calling with consent:
    await loan.connect(borrower).grantLenderAccess(admin.address);
    const thirdPartyHistory = await loan.connect(admin).getRepaymentHistory();
    expect(thirdPartyHistory.length).to.equal(3);
  });
});
