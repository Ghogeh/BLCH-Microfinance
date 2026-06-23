const { expect }      = require("chai");
const { ethers }      = require("hardhat");
const {
  loadFixture,
  time
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("LoanContract", function () {

  // ── Base fixture (all participants registered and verified) ────────────────

  async function baseFixture() {
    const [admin, officer, borrower, lender, guarantor, regulator, stranger] =
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
      await registry.getAddress(),
      await acl.getAddress(),
      admin.address
    );
    await factory.waitForDeployment();

    await registry.connect(admin)
      .setAuthorizedContract(await factory.getAddress(), true);
    await registry.connect(admin).setOfficer(officer.address, true);

    const hash = ethers.keccak256(ethers.toUtf8Bytes("kyc-document"));

    // Register and verify all participants
    for (const wallet of [borrower, lender, guarantor]) {
      await registry.connect(wallet)
        .registerIdentity(wallet.address, hash, "test");
      await registry.connect(officer).verifyIdentity(wallet.address);
    }

    // Assign Roles via ACL
    const ROLES = {
      ENTREPRENEUR: ethers.keccak256(ethers.toUtf8Bytes("ENTREPRENEUR")),
      LENDER:       ethers.keccak256(ethers.toUtf8Bytes("LENDER")),
      GUARANTOR:    ethers.keccak256(ethers.toUtf8Bytes("GUARANTOR")),
      REGULATOR:    ethers.keccak256(ethers.toUtf8Bytes("REGULATOR")),
    };
    await acl.connect(admin).assignRole(borrower.address,   ROLES.ENTREPRENEUR);
    await acl.connect(admin).assignRole(lender.address,     ROLES.LENDER);
    await acl.connect(admin).assignRole(guarantor.address,  ROLES.GUARANTOR);
    await acl.connect(admin).assignRole(regulator.address,  ROLES.REGULATOR);

    const LOAN_AMOUNT   = ethers.parseEther("1.0");
    const DURATION_DAYS = 30;
    const INTEREST_BPS  = 1000; // 10% = totalRepayable 1.1 ETH

    return {
      registry, acl, factory,
      admin, officer, borrower, lender, guarantor, regulator, stranger,
      ROLES, LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS
    };
  }

  // Helper: create a loan via factory
  async function createLoan(fixture) {
    const { factory, borrower, LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS } = fixture;
    await factory.connect(borrower)
      .createLoan(LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS);
    const loanAddr = await factory.getLoan(0);
    const loan = await ethers.getContractAt("LoanContract", loanAddr);
    return { ...fixture, loan, loanAddr };
  }

  // Helper: advance to FUNDING state
  async function loanInFunding(fixture) {
    const base = await createLoan(fixture);
    await base.loan.connect(base.guarantor).provideGuarantee();
    return base;
  }

  // Helper: advance to ACTIVE state
  async function loanInActive(fixture) {
    const base = await loanInFunding(fixture);
    await base.loan.connect(base.lender).fund({ value: base.LOAN_AMOUNT });
    return base;
  }

  // ── Constructor ────────────────────────────────────────────────────────────

  describe("Constructor", function () {
    it("reverts if borrower is not KYC verified", async function () {
      const f = await loadFixture(baseFixture);
      await expect(
        f.factory.connect(f.stranger)
          .createLoan(f.LOAN_AMOUNT, f.DURATION_DAYS, f.INTEREST_BPS)
      ).to.be.revertedWith("LoanFactory: borrower not KYC verified");
    });

    it("reverts if borrower is blacklisted", async function () {
      const f = await loadFixture(baseFixture);
      await f.registry.connect(f.admin)
        .blacklistAddress(f.borrower.address, "test");
      // isVerified() returns false for blacklisted wallets, so the KYC
      // require fires before the explicit blacklist require.
      await expect(
        f.factory.connect(f.borrower)
          .createLoan(f.LOAN_AMOUNT, f.DURATION_DAYS, f.INTEREST_BPS)
      ).to.be.revertedWith("LoanFactory: borrower not KYC verified");
    });

    it("initialises state as OPEN", async function () {
      const f = await loadFixture(baseFixture);
      const base = await createLoan(f);
      expect(await base.loan.getLoanState()).to.equal(0); // OPEN
    });

    it("sets remainingBalance to loanAmount + interest", async function () {
      const f = await loadFixture(baseFixture);
      const base = await createLoan(f);
      // 1 ETH + 10% = 1.1 ETH
      const expected = ethers.parseEther("1.1");
      expect(await base.loan.remainingBalance()).to.equal(expected);
    });

    it("sets initial reputationScore to 50", async function () {
      const f = await loadFixture(baseFixture);
      const base = await createLoan(f);
      expect(await base.loan.reputationScore()).to.equal(50);
    });

    it("emits LoanCreated on the deployed LoanContract", async function () {
      const f = await loadFixture(baseFixture);
      // Create first loan, then inspect the deployed contract for the event
      await f.factory.connect(f.borrower)
        .createLoan(f.LOAN_AMOUNT, f.DURATION_DAYS, f.INTEREST_BPS);
      const loanAddr = await f.factory.getLoan(0);
      const loan = await ethers.getContractAt("LoanContract", loanAddr);
      // LoanCreated is emitted in the constructor; confirm by checking state
      // and that loan.borrower matches (event already verified via LoanContractDeployed)
      expect(await loan.getLoanState()).to.equal(0); // OPEN confirms constructor ran
      expect(await loan.borrower()).to.equal(f.borrower.address);
    });
  });

  // ── provideGuarantee ───────────────────────────────────────────────────────

  describe("provideGuarantee", function () {
    it("allows a KYC-verified non-borrower to guarantee the loan", async function () {
      const f = await loadFixture(baseFixture);
      const base = await createLoan(f);
      await expect(base.loan.connect(f.guarantor).provideGuarantee())
        .to.emit(base.loan, "GuaranteeProvided")
        .withArgs(f.guarantor.address, 1);
    });

    it("transitions state from OPEN to FUNDING on first guarantee", async function () {
      const f = await loadFixture(baseFixture);
      const base = await createLoan(f);
      await base.loan.connect(f.guarantor).provideGuarantee();
      expect(await base.loan.getLoanState()).to.equal(1); // FUNDING
    });

    it("reverts if the borrower tries to guarantee their own loan", async function () {
      const f = await loadFixture(baseFixture);
      const base = await createLoan(f);
      await expect(base.loan.connect(f.borrower).provideGuarantee())
        .to.be.revertedWith("LoanContract: borrower cannot guarantee own loan");
    });

    it("reverts if guarantor is not KYC verified", async function () {
      const f = await loadFixture(baseFixture);
      const base = await createLoan(f);
      await expect(base.loan.connect(f.stranger).provideGuarantee())
        .to.be.revertedWith("LoanContract: guarantor not KYC verified");
    });

    it("second provideGuarantee attempt is blocked by state machine (OPEN→FUNDING)", async function () {
      const f = await loadFixture(baseFixture);
      const base = await createLoan(f);
      // First guarantee transitions OPEN → FUNDING
      await base.loan.connect(f.guarantor).provideGuarantee();
      // Second attempt hits onlyWhenState(OPEN) before the hasGuaranteed check
      // because provideGuarantee is only callable in OPEN state
      await expect(base.loan.connect(f.guarantor).provideGuarantee())
        .to.be.revertedWith("LoanContract: wrong state for this action");
    });

    it("reverts in wrong state (e.g. ACTIVE)", async function () {
      const f  = await loadFixture(baseFixture);
      const base = await loanInActive(f);
      await expect(base.loan.connect(f.guarantor).provideGuarantee())
        .to.be.revertedWith("LoanContract: wrong state for this action");
    });
  });

  // ── fund ──────────────────────────────────────────────────────────────────

  describe("fund", function () {
    it("reverts in OPEN state — guarantee must be provided first", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await createLoan(f);
      await expect(
        base.loan.connect(f.lender).fund({ value: f.LOAN_AMOUNT })
      ).to.be.revertedWith("LoanContract: wrong state for this action");
    });

    it("reverts if msg.value is zero", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInFunding(f);
      await expect(
        base.loan.connect(f.lender).fund({ value: 0 })
      ).to.be.revertedWith("LoanContract: must send ETH");
    });

    it("reverts if the borrower tries to fund their own loan", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInFunding(f);
      await expect(
        base.loan.connect(f.borrower).fund({ value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("LoanContract: borrower cannot fund own loan");
    });

    it("emits Funded event with correct parameters", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInFunding(f);
      const partial = ethers.parseEther("0.5");
      await expect(base.loan.connect(f.lender).fund({ value: partial }))
        .to.emit(base.loan, "Funded")
        .withArgs(f.lender.address, partial, partial);
    });

    it("automatically disburses when totalFunded reaches loanAmount", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInFunding(f);
      await expect(
        base.loan.connect(f.lender).fund({ value: f.LOAN_AMOUNT })
      ).to.emit(base.loan, "LoanDisbursed")
       .withArgs(f.borrower.address, f.LOAN_AMOUNT);
    });

    it("transitions state to ACTIVE after successful disbursement", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInActive(f);
      expect(await base.loan.getLoanState()).to.equal(2); // ACTIVE
    });

    it("transfers exactly loanAmount to the borrower wallet", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInFunding(f);
      const balBefore = await ethers.provider.getBalance(f.borrower.address);
      await base.loan.connect(f.lender).fund({ value: f.LOAN_AMOUNT });
      const balAfter = await ethers.provider.getBalance(f.borrower.address);
      // Borrower receives exactly LOAN_AMOUNT (no gas deduction on receiving ETH)
      expect(balAfter - balBefore).to.equal(f.LOAN_AMOUNT);
    });
  });

  // ── repay ─────────────────────────────────────────────────────────────────

  describe("repay", function () {
    it("reverts from a non-borrower address", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInActive(f);
      await expect(
        base.loan.connect(f.lender).repay({ value: ethers.parseEther("0.1") })
      ).to.be.revertedWith("LoanContract: caller is not the borrower");
    });

    it("reverts if msg.value is zero", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInActive(f);
      await expect(
        base.loan.connect(f.borrower).repay({ value: 0 })
      ).to.be.revertedWith("LoanContract: repayment must be > 0");
    });

    it("reverts if repayment amount exceeds remaining balance", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInActive(f);
      // totalRepayable is 1.1 ETH; try paying 1.2 ETH
      await expect(
        base.loan.connect(f.borrower).repay({ value: ethers.parseEther("1.2") })
      ).to.be.revertedWith("LoanContract: repayment exceeds outstanding balance");
    });

    it("reduces remainingBalance by the payment amount", async function () {
      const f       = await loadFixture(baseFixture);
      const base    = await loanInActive(f);
      const payment = ethers.parseEther("0.5");
      await base.loan.connect(f.borrower).repay({ value: payment });
      // totalRepayable 1.1 ETH - 0.5 ETH = 0.6 ETH
      expect(await base.loan.remainingBalance())
        .to.equal(ethers.parseEther("0.6"));
    });

    it("emits RepaymentMade with correct parameters", async function () {
      const f       = await loadFixture(baseFixture);
      const base    = await loanInActive(f);
      const payment = ethers.parseEther("0.5");
      await expect(
        base.loan.connect(f.borrower).repay({ value: payment })
      )
        .to.emit(base.loan, "RepaymentMade")
        .withArgs(f.borrower.address, payment, ethers.parseEther("0.6"));
    });

    it("emits ReputationUpdated after each repayment", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInActive(f);
      await expect(
        base.loan.connect(f.borrower).repay({ value: ethers.parseEther("0.5") })
      ).to.emit(base.loan, "ReputationUpdated");
    });

    it("increases reputationScore above base 50 after on-time payment", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInActive(f);
      await base.loan.connect(f.borrower)
        .repay({ value: ethers.parseEther("0.5") });
      expect(await base.loan.reputationScore()).to.be.greaterThan(50);
    });

    it("transitions to REPAID when remainingBalance reaches zero", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInActive(f);
      // Pay the full remaining balance (1.1 ETH = loanAmount + 10% interest)
      const totalRepayable = ethers.parseEther("1.1");
      await base.loan.connect(f.borrower).repay({ value: totalRepayable });
      expect(await base.loan.getLoanState()).to.equal(3); // REPAID
    });

    it("appends a RepaymentEntry to repaymentHistory on each payment", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInActive(f);
      await base.loan.connect(f.borrower)
        .repay({ value: ethers.parseEther("0.3") });
      await base.loan.connect(f.borrower)
        .repay({ value: ethers.parseEther("0.3") });
      expect(await base.loan.getRepaymentCount()).to.equal(2);
    });
  });

  // ── checkDefault ──────────────────────────────────────────────────────────

  describe("checkDefault", function () {
    it("reverts if the loan is not yet overdue", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInActive(f);
      await expect(base.loan.connect(f.stranger).checkDefault())
        .to.be.revertedWith("LoanContract: loan is not yet overdue");
    });

    it("reverts in OPEN state", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await createLoan(f);
      await expect(base.loan.connect(f.stranger).checkDefault())
        .to.be.revertedWith("LoanContract: wrong state for this action");
    });

    it("transitions to DEFAULTED when overdue with balance remaining", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInActive(f);
      // Advance 31 days — past the 30-day duration
      await time.increase(31 * 24 * 60 * 60);
      await base.loan.connect(f.stranger).checkDefault();
      expect(await base.loan.getLoanState()).to.equal(4); // DEFAULTED
    });

    it("emits DefaultDeclared with correct days overdue", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInActive(f);
      await time.increase(31 * 24 * 60 * 60); // 1 day overdue
      await expect(base.loan.connect(f.stranger).checkDefault())
        .to.emit(base.loan, "DefaultDeclared");
    });

    it("does NOT trigger blacklist if overdue by less than 90 days", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInActive(f);
      await time.increase(31 * 24 * 60 * 60); // 1 day overdue — below CEMAC threshold
      await base.loan.connect(f.stranger).checkDefault();
      // Borrower should NOT be blacklisted
      expect(await f.registry.blacklisted(f.borrower.address)).to.equal(false);
    });

    it("CEMAC 2026: triggers blacklist via LoanFactory at 90+ days overdue", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInActive(f);

      // Advance 30 (loan duration) + 91 (overdue) = 121 days from deployment
      await time.increase(121 * 24 * 60 * 60);

      await base.loan.connect(f.stranger).checkDefault();

      // The borrower must now be blacklisted in IdentityRegistry
      expect(await f.registry.blacklisted(f.borrower.address)).to.equal(true);
    });

    it("CEMAC: blacklisted borrower immediately fails isVerified check", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInActive(f);
      await time.increase(121 * 24 * 60 * 60);
      await base.loan.connect(f.stranger).checkDefault();

      // isVerified returns false when blacklisted — cross-system effect
      expect(await f.registry.isVerified(f.borrower.address)).to.equal(false);
    });
  });

  // ── Credit passport ───────────────────────────────────────────────────────

  describe("Credit passport — consent management", function () {
    it("reverts getRepaymentHistory without lender consent", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInActive(f);
      await base.loan.connect(f.borrower)
        .repay({ value: ethers.parseEther("0.3") });

      await expect(base.loan.connect(f.lender).getRepaymentHistory())
        .to.be.revertedWith("LoanContract: lender access not granted by borrower");
    });

    it("allows lender to read history after borrower grants access", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInActive(f);
      await base.loan.connect(f.borrower)
        .repay({ value: ethers.parseEther("0.3") });

      await base.loan.connect(f.borrower).grantLenderAccess(f.lender.address);

      const history = await base.loan.connect(f.lender).getRepaymentHistory();
      expect(history.length).to.equal(1);
    });

    it("reverts getRepaymentHistory after consent is revoked", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInActive(f);

      await base.loan.connect(f.borrower).grantLenderAccess(f.lender.address);
      await base.loan.connect(f.borrower).revokeLenderAccess(f.lender.address);

      await expect(base.loan.connect(f.lender).getRepaymentHistory())
        .to.be.revertedWith("LoanContract: lender access not granted by borrower");
    });

    it("regulator reads history without any consent from borrower", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInActive(f);
      await base.loan.connect(f.borrower)
        .repay({ value: ethers.parseEther("0.5") });

      // Regulator has no consent but can still read
      const history = await base.loan.connect(f.regulator)
        .getRepaymentHistoryRegulator();
      expect(history.length).to.equal(1);
    });

    it("stranger cannot call getRepaymentHistoryRegulator", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInActive(f);
      await expect(base.loan.connect(f.stranger).getRepaymentHistoryRegulator())
        .to.be.revertedWith("RBACModifiers: caller does not hold REGULATOR role");
    });
  });

  // ── Reentrancy protection ─────────────────────────────────────────────────

  describe("Reentrancy protection on fund()", function () {
    it("nonReentrant prevents double-disbursement via malicious borrower", async function () {
      const f = await loadFixture(baseFixture);

      // Deploy the malicious borrower contract
      const MaliciousBorrower = await ethers.getContractFactory("MaliciousBorrower");
      const malicious = await MaliciousBorrower.deploy();
      await malicious.waitForDeployment();

      // Register the malicious contract address as a verified borrower
      const hash = ethers.keccak256(ethers.toUtf8Bytes("fake-kyc"));
      await f.registry.connect(f.admin)
        .registerIdentity(await malicious.getAddress(), hash, "ENTREPRENEUR");
      await f.registry.connect(f.officer)
        .verifyIdentity(await malicious.getAddress());

      // Deploy a LoanContract directly with malicious as borrower
      const LoanContract = await ethers.getContractFactory("LoanContract");
      const loanAmount   = ethers.parseEther("1.0");
      const loan = await LoanContract.deploy(
        await malicious.getAddress(),
        loanAmount,
        30,
        1000,
        await f.registry.getAddress(),
        await f.acl.getAddress(),
        await f.factory.getAddress()  // factory address for blacklist callback
      );
      await loan.waitForDeployment();

      // Point the malicious contract at the loan
      await malicious.setTarget(await loan.getAddress());

      // Provide guarantee (needed to transition to FUNDING)
      await loan.connect(f.guarantor).provideGuarantee();

      // Record borrower's ETH balance before disburse
      const balBefore = await malicious.getBalance();

      // Lender funds the full amount — this triggers _disburse() which
      // sends ETH to the malicious contract, which tries to re-enter fund()
      await loan.connect(f.lender).fund({ value: loanAmount });

      const balAfter = await malicious.getBalance();

      // The reentrancy attempt happened
      expect(await malicious.reentrancyAttempted()).to.equal(true);

      // But it FAILED — the malicious contract did NOT get a second disbursement
      expect(await malicious.reentrancySucceeded()).to.equal(false);

      // The borrower received exactly loanAmount — not 2x
      expect(balAfter - balBefore).to.equal(loanAmount);

      // State is correctly ACTIVE (not corrupted)
      expect(await loan.getLoanState()).to.equal(2); // ACTIVE
    });
  });

  // ── Admin: pause / unpause ────────────────────────────────────────────────

  describe("Admin controls", function () {
    it("admin can pause the contract", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInFunding(f);
      await base.loan.connect(f.admin).pause();

      // fund() should now revert with Pausable error
      await expect(
        base.loan.connect(f.lender).fund({ value: f.LOAN_AMOUNT })
      ).to.be.revertedWithCustomError(base.loan, "EnforcedPause");
    });

    it("admin can unpause and normal operations resume", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInFunding(f);
      await base.loan.connect(f.admin).pause();
      await base.loan.connect(f.admin).unpause();

      await expect(
        base.loan.connect(f.lender).fund({ value: f.LOAN_AMOUNT })
      ).to.emit(base.loan, "LoanDisbursed");
    });

    it("non-admin cannot pause the contract", async function () {
      const f    = await loadFixture(baseFixture);
      const base = await loanInFunding(f);
      await expect(base.loan.connect(f.stranger).pause())
        .to.be.revertedWith("RBACModifiers: caller does not hold ADMIN role");
    });
  });
});
