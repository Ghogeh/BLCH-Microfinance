const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("RBACModifiers (via RBACTestHarness)", function () {

  async function deployFixture() {
    const [admin, entrepreneur, lender, regulator, stranger] =
      await ethers.getSigners();

    const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
    const registry = await IdentityRegistry.deploy(admin.address);
    await registry.waitForDeployment();

    const EDLAccessControl = await ethers.getContractFactory("EDLAccessControl");
    const acl = await EDLAccessControl.deploy(await registry.getAddress(), admin.address);
    await acl.waitForDeployment();

    const RBACTestHarness = await ethers.getContractFactory("RBACTestHarness");
    const harness = await RBACTestHarness.deploy(await acl.getAddress());
    await harness.waitForDeployment();

    const ROLES = {
      ENTREPRENEUR: ethers.keccak256(ethers.toUtf8Bytes("ENTREPRENEUR")),
      LENDER:       ethers.keccak256(ethers.toUtf8Bytes("LENDER")),
      REGULATOR:    ethers.keccak256(ethers.toUtf8Bytes("REGULATOR")),
    };

    const sampleHash = ethers.keccak256(ethers.toUtf8Bytes("kyc-doc"));

    // Fully onboard the entrepreneur: register, verify, assign role
    await registry.connect(entrepreneur)
      .registerIdentity(entrepreneur.address, sampleHash, "ENTREPRENEUR");
    await registry.connect(admin).verifyIdentity(entrepreneur.address);
    await acl.connect(admin).assignRole(entrepreneur.address, ROLES.ENTREPRENEUR);

    return { registry, acl, harness, admin, entrepreneur, lender, regulator, stranger, ROLES };
  }

  it("onlyEntrepreneur: allows a verified entrepreneur through", async function () {
    const { harness, entrepreneur } = await loadFixture(deployFixture);
    await expect(harness.connect(entrepreneur).entrepreneurOnlyAction()).to.not.be.reverted;
  });

  it("onlyEntrepreneur: rejects a wallet with no role at all", async function () {
    const { harness, stranger } = await loadFixture(deployFixture);
    await expect(
      harness.connect(stranger).entrepreneurOnlyAction()
    ).to.be.revertedWith("RBACModifiers: caller is not a valid ENTREPRENEUR");
  });

  it("onlyEntrepreneur: rejects an entrepreneur who has since been blacklisted", async function () {
    const { registry, harness, admin, entrepreneur } = await loadFixture(deployFixture);
    await registry.connect(admin).blacklistAddress(entrepreneur.address, "defaulted");

    await expect(
      harness.connect(entrepreneur).entrepreneurOnlyAction()
    ).to.be.revertedWith("RBACModifiers: caller is not a valid ENTREPRENEUR");
  });

  it("onlyLender: rejects an entrepreneur trying to call a lender-only action", async function () {
    const { harness, entrepreneur } = await loadFixture(deployFixture);
    await expect(
      harness.connect(entrepreneur).lenderOnlyAction()
    ).to.be.revertedWith("RBACModifiers: caller is not a valid LENDER");
  });

  it("onlyRegulator: allows a regulator through WITHOUT requiring KYC", async function () {
    const { acl, admin, harness, regulator, ROLES } = await loadFixture(deployFixture);
    await acl.connect(admin).assignRole(regulator.address, ROLES.REGULATOR);

    await expect(harness.connect(regulator).regulatorOnlyAction()).to.not.be.reverted;
  });

  it("onlyAdmin: allows the admin wallet through", async function () {
    const { harness, admin } = await loadFixture(deployFixture);
    await expect(harness.connect(admin).adminOnlyAction()).to.not.be.reverted;
  });

  it("onlyAdmin: rejects a verified entrepreneur (no privilege escalation)", async function () {
    const { harness, entrepreneur } = await loadFixture(deployFixture);
    await expect(
      harness.connect(entrepreneur).adminOnlyAction()
    ).to.be.revertedWith("RBACModifiers: caller does not hold ADMIN role");
  });

  it("onlyConsortiumMember: allows any of the six roles through", async function () {
    const { harness, entrepreneur, admin } = await loadFixture(deployFixture);
    await expect(harness.connect(entrepreneur).consortiumOnlyAction()).to.not.be.reverted;
    await expect(harness.connect(admin).consortiumOnlyAction()).to.not.be.reverted;
  });

  it("onlyConsortiumMember: rejects a wallet with no role assigned at all", async function () {
    const { harness, stranger } = await loadFixture(deployFixture);
    await expect(
      harness.connect(stranger).consortiumOnlyAction()
    ).to.be.revertedWith("RBACModifiers: caller is not a consortium member");
  });
});
