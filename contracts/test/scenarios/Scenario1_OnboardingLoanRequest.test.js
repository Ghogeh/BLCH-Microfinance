const { expect }  = require("chai");
const { ethers }  = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

/**
 * Scenario 1 — Entrepreneur Onboarding and Loan Request Processing
 *
 * Dissertation reference: §4.5.1
 * "An entrepreneur requests a loan of 500,000 CFA (simulated as 500 test
 *  tokens) with a 90-day term and 10% interest, requiring identity
 *  verification, community guarantee pooling, and institutional underwriting."
 *
 * This test validates the complete flow end-to-end:
 *   1. Identity registration (registerIdentity)
 *   2. KYC verification by MFI officer (verifyIdentity)
 *   3. Loan creation via LoanFactory (createLoan)
 *   4. Peer guarantee (provideGuarantee) → state OPEN → FUNDING
 *   5. Single-lender funding (fund) → auto-disbursement → state ACTIVE
 *
 * Expected outcome per dissertation:
 *   "EDL enforces absolute transparency — any consortium participant can
 *    call getLoanState(). Each workflow stage is locked into sequentially
 *    ordered, cryptographically hashed blocks, providing a tamper-resistant
 *    timeline."
 */
describe("Scenario 1: Entrepreneur Onboarding and Loan Request Processing", function () {

  async function deployFullSystem() {
    const [
      admin,        // System admin / consortium deployer
      officer,      // MFI officer (verifies KYC)
      entrepreneur, // The borrower (Nkemdirim Chioma from dissertation)
      guarantor,    // Peer group member
      lender,       // MFI/SACCO funding the loan
    ] = await ethers.getSigners();

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

    // Authorize factory for CEMAC blacklist callback and grant officer role
    await registry.setAuthorizedContract(await factory.getAddress(), true);
    await registry.setOfficer(officer.address, true);

    const kycHash = ethers.keccak256(ethers.toUtf8Bytes("chioma-kyc-document-sha256"));

    // Dissertation values: 500,000 CFA simulated as 500 test tokens (wei)
    // 90-day term, 10% interest (1000 basis points)
    const LOAN_AMOUNT   = ethers.parseUnits("500", "wei");
    const DURATION_DAYS = 90;
    const INTEREST_BPS  = 1000; // 10%

    return {
      registry, acl, factory,
      admin, officer, entrepreneur, guarantor, lender,
      kycHash, LOAN_AMOUNT, DURATION_DAYS, INTEREST_BPS,
    };
  }

  // ── Phase 1 ───────────────────────────────────────────────────────────────

  it("Phase 1: Entrepreneur registers a decentralised identity (DID) on-chain", async function () {
    const f = await loadFixture(deployFullSystem);

    await f.registry.connect(f.entrepreneur).registerIdentity(
      f.entrepreneur.address, f.kycHash, "ENTREPRENEUR"
    );

    const identity = await f.registry.getIdentity(f.entrepreneur.address);
    expect(identity.status).to.equal(1); // KYCStatus.Pending
    expect(identity.kycHash).to.equal(f.kycHash);
    expect(identity.role).to.equal("ENTREPRENEUR");
  });

  // ── Phase 2 ───────────────────────────────────────────────────────────────

  it("Phase 2: MFI Officer verifies KYC — status transitions Pending → Verified", async function () {
    const f = await loadFixture(deployFullSystem);

    await f.registry.connect(f.entrepreneur)
      .registerIdentity(f.entrepreneur.address, f.kycHash, "ENTREPRENEUR");

    // Before verification: isVerified returns false (status = Pending)
    expect(await f.registry.isVerified(f.entrepreneur.address)).to.equal(false);

    await f.registry.connect(f.officer).verifyIdentity(f.entrepreneur.address);

    // After verification: isVerified returns true
    expect(await f.registry.isVerified(f.entrepreneur.address)).to.equal(true);
  });

  // ── Phase 3 ───────────────────────────────────────────────────────────────

  it("Phase 3: Non-verified borrower is BLOCKED from creating a loan", async function () {
    const f = await loadFixture(deployFullSystem);
    // Entrepreneur is registered but NOT verified

    await f.registry.connect(f.entrepreneur)
      .registerIdentity(f.entrepreneur.address, f.kycHash, "ENTREPRENEUR");

    await expect(
      f.factory.connect(f.entrepreneur)
        .createLoan(f.LOAN_AMOUNT, f.DURATION_DAYS, f.INTEREST_BPS)
    ).to.be.revertedWith("LoanFactory: borrower not KYC verified");
  });

  // ── Phase 4 ───────────────────────────────────────────────────────────────

  it("Phase 4: Verified entrepreneur creates loan — state is OPEN, LoanContractDeployed emitted", async function () {
    const f = await loadFixture(deployFullSystem);

    await f.registry.connect(f.entrepreneur)
      .registerIdentity(f.entrepreneur.address, f.kycHash, "ENTREPRENEUR");
    await f.registry.connect(f.officer).verifyIdentity(f.entrepreneur.address);

    await expect(
      f.factory.connect(f.entrepreneur)
        .createLoan(f.LOAN_AMOUNT, f.DURATION_DAYS, f.INTEREST_BPS)
    ).to.emit(f.factory, "LoanContractDeployed");

    const loanAddr = await f.factory.getLoan(0);
    const loan = await ethers.getContractAt("LoanContract", loanAddr);

    expect(await loan.getLoanState()).to.equal(0); // OPEN
    expect(await loan.loanAmount()).to.equal(f.LOAN_AMOUNT);
    expect(await loan.borrower()).to.equal(f.entrepreneur.address);
  });

  // ── Phase 5 ───────────────────────────────────────────────────────────────

  it("Phase 5: Peer guarantee transitions state OPEN → FUNDING", async function () {
    const f = await loadFixture(deployFullSystem);

    // Onboard entrepreneur
    await f.registry.connect(f.entrepreneur)
      .registerIdentity(f.entrepreneur.address, f.kycHash, "ENTREPRENEUR");
    await f.registry.connect(f.officer).verifyIdentity(f.entrepreneur.address);

    // Onboard guarantor
    const guarantorHash = ethers.keccak256(ethers.toUtf8Bytes("guarantor-kyc"));
    await f.registry.connect(f.guarantor)
      .registerIdentity(f.guarantor.address, guarantorHash, "GUARANTOR");
    await f.registry.connect(f.officer).verifyIdentity(f.guarantor.address);

    await f.factory.connect(f.entrepreneur)
      .createLoan(f.LOAN_AMOUNT, f.DURATION_DAYS, f.INTEREST_BPS);
    const loanAddr = await f.factory.getLoan(0);
    const loan = await ethers.getContractAt("LoanContract", loanAddr);

    expect(await loan.getLoanState()).to.equal(0); // OPEN

    await expect(loan.connect(f.guarantor).provideGuarantee())
      .to.emit(loan, "GuaranteeProvided")
      .withArgs(f.guarantor.address, 1);

    expect(await loan.getLoanState()).to.equal(1); // FUNDING
    expect((await loan.getGuarantors()).length).to.equal(1);
  });

  // ── Phase 6 ───────────────────────────────────────────────────────────────

  it("Phase 6: Lender funds loan — auto-disbursement fires, state → ACTIVE", async function () {
    const f = await loadFixture(deployFullSystem);

    const kycH = ethers.keccak256(ethers.toUtf8Bytes("kyc"));
    await f.registry.connect(f.entrepreneur)
      .registerIdentity(f.entrepreneur.address, kycH, "ENTREPRENEUR");
    await f.registry.connect(f.officer).verifyIdentity(f.entrepreneur.address);
    await f.registry.connect(f.guarantor)
      .registerIdentity(f.guarantor.address, kycH, "GUARANTOR");
    await f.registry.connect(f.officer).verifyIdentity(f.guarantor.address);

    await f.factory.connect(f.entrepreneur)
      .createLoan(f.LOAN_AMOUNT, f.DURATION_DAYS, f.INTEREST_BPS);
    const loanAddr = await f.factory.getLoan(0);
    const loan = await ethers.getContractAt("LoanContract", loanAddr);
    await loan.connect(f.guarantor).provideGuarantee();

    const balanceBefore = await ethers.provider.getBalance(f.entrepreneur.address);

    await expect(loan.connect(f.lender).fund({ value: f.LOAN_AMOUNT }))
      .to.emit(loan, "LoanDisbursed")
      .withArgs(f.entrepreneur.address, f.LOAN_AMOUNT);

    expect(await loan.getLoanState()).to.equal(2); // ACTIVE

    const balanceAfter = await ethers.provider.getBalance(f.entrepreneur.address);
    expect(balanceAfter - balanceBefore).to.equal(f.LOAN_AMOUNT);
  });

  // ── Full end-to-end ───────────────────────────────────────────────────────

  it("FULL SCENARIO 1: Complete onboarding flow from DID registration to active disbursed loan", async function () {
    const f = await loadFixture(deployFullSystem);

    // Step 1: Identity registration (KYC hash = SHA-256 of document, stored off-chain)
    const kycH = ethers.keccak256(ethers.toUtf8Bytes("chioma-national-id"));
    await f.registry.connect(f.entrepreneur)
      .registerIdentity(f.entrepreneur.address, kycH, "ENTREPRENEUR");

    // Step 2: KYC verification by MFI officer
    await f.registry.connect(f.officer).verifyIdentity(f.entrepreneur.address);
    expect(await f.registry.isVerified(f.entrepreneur.address)).to.be.true;

    // Step 3: Guarantor onboarding (peer group member providing social collateral)
    const gKycH = ethers.keccak256(ethers.toUtf8Bytes("fon-national-id"));
    await f.registry.connect(f.guarantor)
      .registerIdentity(f.guarantor.address, gKycH, "GUARANTOR");
    await f.registry.connect(f.officer).verifyIdentity(f.guarantor.address);

    // Step 4: Loan creation — dissertation scenario: 500 tokens, 90 days, 10%
    await f.factory.connect(f.entrepreneur)
      .createLoan(f.LOAN_AMOUNT, f.DURATION_DAYS, f.INTEREST_BPS);
    const loanAddr = await f.factory.getLoan(0);
    const loan = await ethers.getContractAt("LoanContract", loanAddr);

    // Step 5: Peer guarantee (digital signature of joint liability commitment)
    await loan.connect(f.guarantor).provideGuarantee();
    expect(await loan.getLoanState()).to.equal(1); // FUNDING

    // Step 6: MFI funding — triggers auto-disbursement when fully funded
    await loan.connect(f.lender).fund({ value: f.LOAN_AMOUNT });

    // ── Final dissertation assertions ─────────────────────────────────────

    // "Each workflow stage is locked into sequentially ordered blocks"
    expect(await loan.getLoanState()).to.equal(2);              // ACTIVE
    expect(await loan.loanAmount()).to.equal(f.LOAN_AMOUNT);   // 500 tokens
    expect(await loan.totalFunded()).to.equal(f.LOAN_AMOUNT);  // fully funded

    // "The Factory maintains an immutable registry of deployed loan contracts"
    expect(await f.factory.isDeployedLoan(loanAddr)).to.be.true;
    const borrowerLoans = await f.factory.getBorrowerLoans(f.entrepreneur.address);
    expect(borrowerLoans.length).to.equal(1);
    expect(borrowerLoans[0]).to.equal(loanAddr);

    // "Any consortium participant can call getLoanState() without a central gatekeeper"
    expect(await loan.connect(f.lender).getLoanState()).to.equal(2);
    expect(await loan.connect(f.guarantor).getLoanState()).to.equal(2);
  });
});
