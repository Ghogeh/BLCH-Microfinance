const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("EDLAccessControl", function () {

  async function deployFixture() {
    const [admin, entrepreneur, lender, regulator, stranger] =
      await ethers.getSigners();

    const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
    const registry = await IdentityRegistry.deploy(admin.address);
    await registry.waitForDeployment();
    const registryAddress = await registry.getAddress();

    const EDLAccessControl = await ethers.getContractFactory("EDLAccessControl");
    const acl = await EDLAccessControl.deploy(registryAddress, admin.address);
    await acl.waitForDeployment();

    const ROLES = {
      ENTREPRENEUR: ethers.keccak256(ethers.toUtf8Bytes("ENTREPRENEUR")),
      LENDER:       ethers.keccak256(ethers.toUtf8Bytes("LENDER")),
      MFI_OFFICER:  ethers.keccak256(ethers.toUtf8Bytes("MFI_OFFICER")),
      REGULATOR:    ethers.keccak256(ethers.toUtf8Bytes("REGULATOR")),
      GUARANTOR:    ethers.keccak256(ethers.toUtf8Bytes("GUARANTOR")),
      ADMIN:        ethers.keccak256(ethers.toUtf8Bytes("ADMIN")),
    };

    const sampleHash = ethers.keccak256(ethers.toUtf8Bytes("kyc-doc"));

    return { registry, acl, admin, entrepreneur, lender, regulator, stranger, ROLES, sampleHash };
  }

  describe("Deployment", function () {
    it("grants ADMIN and DEFAULT_ADMIN_ROLE to the admin wallet", async function () {
      const { acl, admin, ROLES } = await loadFixture(deployFixture);
      expect(await acl.hasRole(ROLES.ADMIN, admin.address)).to.equal(true);
      expect(await acl.hasRole(await acl.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
    });
  });

  describe("assignRole — non-regulator roles require KYC", function () {
    it("reverts if the wallet is not yet KYC-verified", async function () {
      const { acl, admin, entrepreneur, ROLES } = await loadFixture(deployFixture);
      await expect(
        acl.connect(admin).assignRole(entrepreneur.address, ROLES.ENTREPRENEUR)
      ).to.be.revertedWith("EDLAccessControl: wallet must be KYC-verified before role assignment");
    });

    it("succeeds once the wallet is KYC-verified in IdentityRegistry", async function () {
      const { registry, acl, admin, entrepreneur, ROLES, sampleHash } =
        await loadFixture(deployFixture);

      await registry.connect(entrepreneur)
        .registerIdentity(entrepreneur.address, sampleHash, "ENTREPRENEUR");
      await registry.connect(admin).verifyIdentity(entrepreneur.address);

      await expect(acl.connect(admin).assignRole(entrepreneur.address, ROLES.ENTREPRENEUR))
        .to.emit(acl, "RoleAssigned")
        .withArgs(entrepreneur.address, ROLES.ENTREPRENEUR, admin.address);

      expect(await acl.hasRole(ROLES.ENTREPRENEUR, entrepreneur.address)).to.equal(true);
    });

    it("reverts if the wallet is blacklisted, even if previously verified", async function () {
      const { registry, acl, admin, lender, ROLES, sampleHash } =
        await loadFixture(deployFixture);

      await registry.connect(lender).registerIdentity(lender.address, sampleHash, "LENDER");
      await registry.connect(admin).verifyIdentity(lender.address);
      await registry.connect(admin).blacklistAddress(lender.address, "fraud");

      // isVerified() returns false when blacklisted (combined check in IdentityRegistry),
      // so the KYC require fires first — the wallet is effectively unverified once blacklisted.
      await expect(
        acl.connect(admin).assignRole(lender.address, ROLES.LENDER)
      ).to.be.revertedWith("EDLAccessControl: wallet must be KYC-verified before role assignment");
    });
  });

  describe("assignRole — regulator exemption", function () {
    it("allows REGULATOR role WITHOUT requiring standard KYC verification", async function () {
      const { acl, admin, regulator, ROLES } = await loadFixture(deployFixture);

      // Note: regulator.address was NEVER registered or verified in IdentityRegistry.
      // This is the deliberate institutional-onboarding exemption.
      await expect(acl.connect(admin).assignRole(regulator.address, ROLES.REGULATOR))
        .to.not.be.reverted;

      expect(await acl.hasRole(ROLES.REGULATOR, regulator.address)).to.equal(true);
    });

    it("STILL reverts the regulator exemption if the wallet is blacklisted", async function () {
      const { registry, acl, admin, regulator, ROLES } = await loadFixture(deployFixture);
      await registry.connect(admin).blacklistAddress(regulator.address, "compromised node");

      await expect(
        acl.connect(admin).assignRole(regulator.address, ROLES.REGULATOR)
      ).to.be.revertedWith("EDLAccessControl: blacklisted address cannot hold a role");
    });

    it("does NOT grant the KYC exemption to any role other than REGULATOR", async function () {
      const { acl, admin, lender, ROLES } = await loadFixture(deployFixture);
      // lender.address has not been KYC-verified — only REGULATOR skips that check
      await expect(
        acl.connect(admin).assignRole(lender.address, ROLES.LENDER)
      ).to.be.revertedWith("EDLAccessControl: wallet must be KYC-verified before role assignment");
    });
  });

  describe("Authorization boundaries", function () {
    it("reverts when a non-ADMIN wallet tries to assign a role", async function () {
      const { acl, stranger, regulator, ROLES } = await loadFixture(deployFixture);
      await expect(
        acl.connect(stranger).assignRole(regulator.address, ROLES.REGULATOR)
      ).to.be.revertedWithCustomError(acl, "AccessControlUnauthorizedAccount");
    });

    it("allows ADMIN to revoke a previously assigned role", async function () {
      const { acl, admin, regulator, ROLES } = await loadFixture(deployFixture);
      await acl.connect(admin).assignRole(regulator.address, ROLES.REGULATOR);

      // OZ AccessControl also emits RoleRevoked(bytes32,address,address) — ambiguous name.
      // We verify our custom EDLAccessControl.RoleRevoked fired by checking the tx logs
      // directly, and confirm the outcome via hasRole().
      const tx = await acl.connect(admin).revokeRoleFromWallet(regulator.address, ROLES.REGULATOR);
      const receipt = await tx.wait();
      const iface = acl.interface;
      const revokedLog = receipt.logs.find(log => {
        try { return iface.parseLog(log)?.name === "RoleRevoked"; } catch { return false; }
      });
      expect(revokedLog).to.not.be.undefined;

      expect(await acl.hasRole(ROLES.REGULATOR, regulator.address)).to.equal(false);
    });
  });

  describe("hasValidRole", function () {
    it("returns true only when role + KYC verified + not blacklisted all hold", async function () {
      const { registry, acl, admin, entrepreneur, ROLES, sampleHash } =
        await loadFixture(deployFixture);

      await registry.connect(entrepreneur)
        .registerIdentity(entrepreneur.address, sampleHash, "ENTREPRENEUR");
      await registry.connect(admin).verifyIdentity(entrepreneur.address);
      await acl.connect(admin).assignRole(entrepreneur.address, ROLES.ENTREPRENEUR);

      expect(await acl.hasValidRole(entrepreneur.address, ROLES.ENTREPRENEUR)).to.equal(true);
    });

    it("returns false if the role was granted but the wallet is later blacklisted", async function () {
      const { registry, acl, admin, entrepreneur, ROLES, sampleHash } =
        await loadFixture(deployFixture);

      await registry.connect(entrepreneur)
        .registerIdentity(entrepreneur.address, sampleHash, "ENTREPRENEUR");
      await registry.connect(admin).verifyIdentity(entrepreneur.address);
      await acl.connect(admin).assignRole(entrepreneur.address, ROLES.ENTREPRENEUR);

      await registry.connect(admin).blacklistAddress(entrepreneur.address, "default");

      // hasRole() still technically true (OpenZeppelin doesn't auto-revoke),
      // but hasValidRole() correctly reports false — this is the whole point
      // of the combined check.
      expect(await acl.hasRole(ROLES.ENTREPRENEUR, entrepreneur.address)).to.equal(true);
      expect(await acl.hasValidRole(entrepreneur.address, ROLES.ENTREPRENEUR)).to.equal(false);
    });
  });
});
