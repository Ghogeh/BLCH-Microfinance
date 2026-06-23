const { expect }      = require("chai");
const { ethers }      = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("LoanFactory", function () {

  // ── Shared fixture ──────────────────────────────────────────────────────────

  async function deployFixture() {
    const [admin, officer, borrower, lender, stranger] =
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

    // Authorize factory so its deployed loans can trigger blacklisting
    await registry.connect(admin)
      .setAuthorizedContract(await factory.getAddress(), true);

    // Set up officer
    await registry.connect(admin).setOfficer(officer.address, true);

    // KYC the borrower
    const sampleHash = ethers.keccak256(ethers.toUtf8Bytes("kyc-document"));
    await registry.connect(borrower)
      .registerIdentity(borrower.address, sampleHash, "ENTREPRENEUR");
    await registry.connect(officer).verifyIdentity(borrower.address);

    const LOAN_AMOUNT    = ethers.parseEther("1.0");
    const DURATION_DAYS  = 30;
    const INTEREST_BPS   = 1000; // 10%

    return {
      registry, acl, factory,
      admin, officer, borrower, lender, stranger,
      sampleHash, LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS
    };
  }

  // ── Deployment ──────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("stores the correct registry and acl addresses", async function () {
      const { factory, registry, acl } = await loadFixture(deployFixture);
      expect(await factory.registry()).to.equal(await registry.getAddress());
      expect(await factory.acl()).to.equal(await acl.getAddress());
    });

    it("starts with zero loans", async function () {
      const { factory } = await loadFixture(deployFixture);
      expect(await factory.getLoanCount()).to.equal(0);
    });
  });

  // ── createLoan ──────────────────────────────────────────────────────────────

  describe("createLoan", function () {
    it("reverts if the caller is not KYC verified", async function () {
      const { factory, stranger, LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS } =
        await loadFixture(deployFixture);
      await expect(
        factory.connect(stranger)
          .createLoan(LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS)
      ).to.be.revertedWith("LoanFactory: borrower not KYC verified");
    });

    it("reverts if the caller is blacklisted", async function () {
      const { registry, factory, admin, borrower, LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS } =
        await loadFixture(deployFixture);
      await registry.connect(admin)
        .blacklistAddress(borrower.address, "fraud detected");

      // isVerified() returns false for blacklisted wallets (combined check),
      // so the KYC require fires before the explicit blacklist require.
      await expect(
        factory.connect(borrower)
          .createLoan(LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS)
      ).to.be.revertedWith("LoanFactory: borrower not KYC verified");
    });

    it("reverts if amount is zero", async function () {
      const { factory, borrower, DURATION_DAYS, INTEREST_BPS } =
        await loadFixture(deployFixture);
      await expect(
        factory.connect(borrower).createLoan(0, DURATION_DAYS, INTEREST_BPS)
      ).to.be.revertedWith("LoanFactory: loan amount must be > 0");
    });

    it("reverts if interest rate exceeds 30%", async function () {
      const { factory, borrower, LOAN_AMOUNT, DURATION_DAYS } =
        await loadFixture(deployFixture);
      await expect(
        factory.connect(borrower).createLoan(LOAN_AMOUNT, DURATION_DAYS, 3001)
      ).to.be.revertedWith("LoanFactory: interest rate cannot exceed 30%");
    });

    it("deploys a LoanContract and emits LoanContractDeployed", async function () {
      const { factory, borrower, LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS } =
        await loadFixture(deployFixture);

      await expect(
        factory.connect(borrower)
          .createLoan(LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS)
      ).to.emit(factory, "LoanContractDeployed");
    });

    it("registers the deployed loan in allLoans and isDeployedLoan", async function () {
      const { factory, borrower, LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS } =
        await loadFixture(deployFixture);

      await factory.connect(borrower)
        .createLoan(LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS);

      expect(await factory.getLoanCount()).to.equal(1);
      const loanAddr = await factory.getLoan(0);
      expect(await factory.isDeployedLoan(loanAddr)).to.equal(true);
    });

    it("adds the loan to borrowerLoans for the caller", async function () {
      const { factory, borrower, LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS } =
        await loadFixture(deployFixture);

      await factory.connect(borrower)
        .createLoan(LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS);

      const loans = await factory.getBorrowerLoans(borrower.address);
      expect(loans.length).to.equal(1);
    });

    it("deployed LoanContract has correct borrower and loanAmount", async function () {
      const { factory, borrower, LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS } =
        await loadFixture(deployFixture);

      await factory.connect(borrower)
        .createLoan(LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS);

      const loanAddr = await factory.getLoan(0);
      const loan = await ethers.getContractAt("LoanContract", loanAddr);

      expect(await loan.borrower()).to.equal(borrower.address);
      expect(await loan.loanAmount()).to.equal(LOAN_AMOUNT);
    });
  });

  // ── requestBlacklist ────────────────────────────────────────────────────────

  describe("requestBlacklist", function () {
    it("reverts when called by an address that is not a deployed loan", async function () {
      const { factory, stranger } = await loadFixture(deployFixture);
      await expect(
        factory.connect(stranger)
          .requestBlacklist(stranger.address, "test")
      ).to.be.revertedWith("LoanFactory: caller is not a deployed loan contract");
    });

    it("reverts when called by the factory owner (not a deployed loan)", async function () {
      const { factory, admin } = await loadFixture(deployFixture);
      await expect(
        factory.connect(admin).requestBlacklist(admin.address, "test")
      ).to.be.revertedWith("LoanFactory: caller is not a deployed loan contract");
    });
  });

  // ── View functions ──────────────────────────────────────────────────────────

  describe("View functions", function () {
    it("getLoan reverts on out-of-bounds index", async function () {
      const { factory } = await loadFixture(deployFixture);
      await expect(factory.getLoan(0))
        .to.be.revertedWith("LoanFactory: index out of bounds");
    });

    it("getBorrowerLoans returns empty array for unknown borrower", async function () {
      const { factory, stranger } = await loadFixture(deployFixture);
      const loans = await factory.getBorrowerLoans(stranger.address);
      expect(loans.length).to.equal(0);
    });

    it("getAllLoans returns all deployed loan addresses", async function () {
      const { factory, borrower, LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS } =
        await loadFixture(deployFixture);

      await factory.connect(borrower)
        .createLoan(LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS);
      await factory.connect(borrower)
        .createLoan(LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS);

      const all = await factory.getAllLoans();
      expect(all.length).to.equal(2);
    });
  });
});
