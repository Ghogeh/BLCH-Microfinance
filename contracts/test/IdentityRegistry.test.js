const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("IdentityRegistry", function () {

  async function deployFixture() {
    const [owner, officer, entrepreneur, lender, stranger, authorizedContract] =
      await ethers.getSigners();

    const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
    const registry = await IdentityRegistry.deploy(owner.address);
    await registry.waitForDeployment();

    const sampleHash = ethers.keccak256(ethers.toUtf8Bytes("national-id-doc-bytes"));

    return { registry, owner, officer, entrepreneur, lender, stranger, authorizedContract, sampleHash };
  }

  // ── Deployment ─────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets the deployer as owner", async function () {
      const { registry, owner } = await loadFixture(deployFixture);
      expect(await registry.owner()).to.equal(owner.address);
    });

    it("grants isOfficer to the deployer by default", async function () {
      const { registry, owner } = await loadFixture(deployFixture);
      expect(await registry.isOfficer(owner.address)).to.equal(true);
    });
  });

  // ── Officer management ──────────────────────────────────────────────────────

  describe("setOfficer", function () {
    it("owner can grant officer status to a wallet", async function () {
      const { registry, owner, officer } = await loadFixture(deployFixture);
      await expect(registry.connect(owner).setOfficer(officer.address, true))
        .to.emit(registry, "OfficerStatusChanged")
        .withArgs(officer.address, true);
      expect(await registry.isOfficer(officer.address)).to.equal(true);
    });

    it("owner can revoke officer status", async function () {
      const { registry, owner, officer } = await loadFixture(deployFixture);
      await registry.connect(owner).setOfficer(officer.address, true);
      await registry.connect(owner).setOfficer(officer.address, false);
      expect(await registry.isOfficer(officer.address)).to.equal(false);
    });

    it("non-owner cannot grant officer status", async function () {
      const { registry, stranger, officer } = await loadFixture(deployFixture);
      await expect(registry.connect(stranger).setOfficer(officer.address, true))
        .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  // ── Authorized contracts ────────────────────────────────────────────────────

  describe("setAuthorizedContract", function () {
    it("owner can authorize a contract address", async function () {
      const { registry, owner, authorizedContract } = await loadFixture(deployFixture);
      await expect(registry.connect(owner).setAuthorizedContract(authorizedContract.address, true))
        .to.emit(registry, "AuthorizedContractChanged")
        .withArgs(authorizedContract.address, true);
      expect(await registry.authorizedContracts(authorizedContract.address)).to.equal(true);
    });

    it("authorized contract can call blacklistAddress()", async function () {
      const { registry, owner, entrepreneur, authorizedContract, sampleHash } =
        await loadFixture(deployFixture);

      await registry.connect(owner).setAuthorizedContract(authorizedContract.address, true);
      await registry.connect(entrepreneur)
        .registerIdentity(entrepreneur.address, sampleHash, "ENTREPRENEUR");

      await expect(
        registry.connect(authorizedContract).blacklistAddress(entrepreneur.address, "90-day default")
      ).to.emit(registry, "AddressBlacklisted").withArgs(entrepreneur.address, "90-day default");

      expect(await registry.blacklisted(entrepreneur.address)).to.equal(true);
    });

    it("non-owner cannot set authorized contract", async function () {
      const { registry, stranger, authorizedContract } = await loadFixture(deployFixture);
      await expect(registry.connect(stranger).setAuthorizedContract(authorizedContract.address, true))
        .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  // ── registerIdentity ────────────────────────────────────────────────────────

  describe("registerIdentity", function () {
    it("registers a new identity with Pending status", async function () {
      const { registry, entrepreneur, sampleHash } = await loadFixture(deployFixture);

      await expect(
        registry.connect(entrepreneur)
          .registerIdentity(entrepreneur.address, sampleHash, "ENTREPRENEUR")
      ).to.emit(registry, "IdentityRegistered")
        .withArgs(entrepreneur.address, sampleHash, "ENTREPRENEUR");

      const identity = await registry.identities(entrepreneur.address);
      expect(identity.status).to.equal(1); // KYCStatus.Pending
      expect(identity.kycHash).to.equal(sampleHash);
    });

    it("reverts if wallet tries to register twice", async function () {
      const { registry, entrepreneur, sampleHash } = await loadFixture(deployFixture);
      await registry.connect(entrepreneur)
        .registerIdentity(entrepreneur.address, sampleHash, "ENTREPRENEUR");

      await expect(
        registry.connect(entrepreneur)
          .registerIdentity(entrepreneur.address, sampleHash, "ENTREPRENEUR")
      ).to.be.revertedWith("IdentityRegistry: already registered");
    });

    it("reverts if wallet is blacklisted", async function () {
      const { registry, owner, entrepreneur, sampleHash } = await loadFixture(deployFixture);
      await registry.connect(owner).blacklistAddress(entrepreneur.address, "prior fraud");

      await expect(
        registry.connect(entrepreneur)
          .registerIdentity(entrepreneur.address, sampleHash, "ENTREPRENEUR")
      ).to.be.revertedWith("IdentityRegistry: address is blacklisted");
    });
  });

  // ── verifyIdentity ──────────────────────────────────────────────────────────

  describe("verifyIdentity", function () {
    it("officer can verify a Pending identity", async function () {
      const { registry, owner, officer, entrepreneur, sampleHash } =
        await loadFixture(deployFixture);

      await registry.connect(owner).setOfficer(officer.address, true);
      await registry.connect(entrepreneur)
        .registerIdentity(entrepreneur.address, sampleHash, "ENTREPRENEUR");

      await expect(registry.connect(officer).verifyIdentity(entrepreneur.address))
        .to.emit(registry, "IdentityVerified")
        .withArgs(entrepreneur.address, officer.address);

      expect(await registry.identities(entrepreneur.address).then(i => i.status)).to.equal(2); // Verified
    });

    it("reverts if identity is not in Pending state", async function () {
      const { registry, owner, entrepreneur, sampleHash } = await loadFixture(deployFixture);
      await registry.connect(entrepreneur)
        .registerIdentity(entrepreneur.address, sampleHash, "ENTREPRENEUR");
      await registry.connect(owner).verifyIdentity(entrepreneur.address);

      await expect(registry.connect(owner).verifyIdentity(entrepreneur.address))
        .to.be.revertedWith("IdentityRegistry: not in Pending state");
    });

    it("non-officer cannot verify an identity", async function () {
      const { registry, entrepreneur, stranger, sampleHash } = await loadFixture(deployFixture);
      await registry.connect(entrepreneur)
        .registerIdentity(entrepreneur.address, sampleHash, "ENTREPRENEUR");

      await expect(registry.connect(stranger).verifyIdentity(entrepreneur.address))
        .to.be.revertedWith("IdentityRegistry: caller is not an officer or owner");
    });
  });

  // ── rejectIdentity ──────────────────────────────────────────────────────────

  describe("rejectIdentity", function () {
    it("officer can reject a Pending identity with a reason", async function () {
      const { registry, owner, entrepreneur, sampleHash } = await loadFixture(deployFixture);
      await registry.connect(entrepreneur)
        .registerIdentity(entrepreneur.address, sampleHash, "ENTREPRENEUR");

      await expect(
        registry.connect(owner).rejectIdentity(entrepreneur.address, "document expired")
      ).to.emit(registry, "IdentityRejected")
        .withArgs(entrepreneur.address, owner.address, "document expired");

      expect(await registry.identities(entrepreneur.address).then(i => i.status)).to.equal(3); // Rejected
    });

    it("reverts if identity is not in Pending state", async function () {
      const { registry, owner, entrepreneur, sampleHash } = await loadFixture(deployFixture);
      await registry.connect(entrepreneur)
        .registerIdentity(entrepreneur.address, sampleHash, "ENTREPRENEUR");
      await registry.connect(owner).verifyIdentity(entrepreneur.address);

      await expect(
        registry.connect(owner).rejectIdentity(entrepreneur.address, "too late")
      ).to.be.revertedWith("IdentityRegistry: not in Pending state");
    });
  });

  // ── blacklistAddress / unblacklistAddress ───────────────────────────────────

  describe("blacklistAddress / unblacklistAddress", function () {
    it("owner can blacklist a wallet", async function () {
      const { registry, owner, entrepreneur } = await loadFixture(deployFixture);
      await expect(
        registry.connect(owner).blacklistAddress(entrepreneur.address, "CEMAC 90-day default")
      ).to.emit(registry, "AddressBlacklisted").withArgs(entrepreneur.address, "CEMAC 90-day default");

      expect(await registry.blacklisted(entrepreneur.address)).to.equal(true);
    });

    it("owner can unblacklist a wallet", async function () {
      const { registry, owner, entrepreneur } = await loadFixture(deployFixture);
      await registry.connect(owner).blacklistAddress(entrepreneur.address, "default");

      await expect(registry.connect(owner).unblacklistAddress(entrepreneur.address))
        .to.emit(registry, "AddressUnblacklisted").withArgs(entrepreneur.address);

      expect(await registry.blacklisted(entrepreneur.address)).to.equal(false);
    });

    it("non-owner cannot blacklist", async function () {
      const { registry, stranger, entrepreneur } = await loadFixture(deployFixture);
      await expect(
        registry.connect(stranger).blacklistAddress(entrepreneur.address, "fraud")
      ).to.be.revertedWith("IdentityRegistry: caller not authorized");
    });

    it("non-owner cannot unblacklist", async function () {
      const { registry, owner, stranger, entrepreneur } = await loadFixture(deployFixture);
      await registry.connect(owner).blacklistAddress(entrepreneur.address, "default");

      await expect(registry.connect(stranger).unblacklistAddress(entrepreneur.address))
        .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  // ── isVerified ──────────────────────────────────────────────────────────────

  describe("isVerified", function () {
    it("returns true for a verified, non-blacklisted wallet", async function () {
      const { registry, owner, entrepreneur, sampleHash } = await loadFixture(deployFixture);
      await registry.connect(entrepreneur)
        .registerIdentity(entrepreneur.address, sampleHash, "ENTREPRENEUR");
      await registry.connect(owner).verifyIdentity(entrepreneur.address);

      expect(await registry.isVerified(entrepreneur.address)).to.equal(true);
    });

    it("returns false for a pending wallet", async function () {
      const { registry, entrepreneur, sampleHash } = await loadFixture(deployFixture);
      await registry.connect(entrepreneur)
        .registerIdentity(entrepreneur.address, sampleHash, "ENTREPRENEUR");
      expect(await registry.isVerified(entrepreneur.address)).to.equal(false);
    });

    it("returns false for a verified but blacklisted wallet", async function () {
      const { registry, owner, entrepreneur, sampleHash } = await loadFixture(deployFixture);
      await registry.connect(entrepreneur)
        .registerIdentity(entrepreneur.address, sampleHash, "ENTREPRENEUR");
      await registry.connect(owner).verifyIdentity(entrepreneur.address);
      await registry.connect(owner).blacklistAddress(entrepreneur.address, "default");

      expect(await registry.isVerified(entrepreneur.address)).to.equal(false);
    });

    it("returns false for an unregistered wallet", async function () {
      const { registry, stranger } = await loadFixture(deployFixture);
      expect(await registry.isVerified(stranger.address)).to.equal(false);
    });
  });

  // ── getIdentity ─────────────────────────────────────────────────────────────

  describe("getIdentity", function () {
    it("returns full Identity struct for a registered wallet", async function () {
      const { registry, entrepreneur, sampleHash } = await loadFixture(deployFixture);
      await registry.connect(entrepreneur)
        .registerIdentity(entrepreneur.address, sampleHash, "ENTREPRENEUR");

      const identity = await registry.getIdentity(entrepreneur.address);
      expect(identity.kycHash).to.equal(sampleHash);
      expect(identity.status).to.equal(1); // Pending
      expect(identity.role).to.equal("ENTREPRENEUR");
      expect(identity.registeredAt).to.be.gt(0);
    });

    it("returns zero-value struct for unregistered wallet", async function () {
      const { registry, stranger } = await loadFixture(deployFixture);
      const identity = await registry.getIdentity(stranger.address);
      expect(identity.status).to.equal(0); // Unregistered
    });
  });
});
