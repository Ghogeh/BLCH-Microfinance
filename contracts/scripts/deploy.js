const { ethers } = require("hardhat");
const fs   = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying M3 contracts from:", deployer.address);
  console.log("Balance:", ethers.formatEther(
    await ethers.provider.getBalance(deployer.address)
  ), "ETH\n");

  // ── Load M2 deployment ───────────────────────────────────────────────────

  const deploymentsDir = path.join(__dirname, "../deployments");
  const latestPath     = path.join(deploymentsDir, "ganache-latest.json");

  if (!fs.existsSync(latestPath)) {
    console.error("ERROR: contracts/deployments/ganache-latest.json not found.");
    console.error("Run M2 deploy first: npx hardhat run scripts/deploy.js --network ganache");
    process.exit(1);
  }

  const m2 = JSON.parse(fs.readFileSync(latestPath, "utf8"));
  console.log("Building on M2 deployment:");
  console.log("  IdentityRegistry:", m2.contracts.IdentityRegistry);
  console.log("  EDLAccessControl:", m2.contracts.EDLAccessControl);
  console.log("");

  // ── Deploy LoanFactory ────────────────────────────────────────────────────

  const LoanFactory = await ethers.getContractFactory("LoanFactory");
  const factory     = await LoanFactory.deploy(
    m2.contracts.IdentityRegistry,
    m2.contracts.EDLAccessControl,
    deployer.address
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("✓ LoanFactory deployed to:", factoryAddress);

  // ── Authorize LoanFactory in IdentityRegistry ──────────────────────────────

  const registry = await ethers.getContractAt(
    "IdentityRegistry",
    m2.contracts.IdentityRegistry
  );
  const authTx = await registry.setAuthorizedContract(factoryAddress, true);
  await authTx.wait();
  console.log("✓ LoanFactory authorized in IdentityRegistry");

  // Verify the authorization worked
  const isAuth = await registry.authorizedContracts(factoryAddress);
  if (!isAuth) {
    console.error("CRITICAL: Authorization failed — check deployer is registry owner");
    process.exit(1);
  }
  console.log("✓ Authorization verified: registry.authorizedContracts(factory) =", isAuth);

  // ── Update deployment record ──────────────────────────────────────────────

  const network = await ethers.provider.getNetwork();
  const updated = {
    ...m2,
    milestone:   "M3",
    lastUpdated: new Date().toISOString(),
    contracts: {
      ...m2.contracts,
      LoanFactory: factoryAddress,
    }
  };

  // Write latest
  fs.writeFileSync(latestPath, JSON.stringify(updated, null, 2));
  console.log("✓ Updated ganache-latest.json");

  // Write dated backup
  const stamp      = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = path.join(deploymentsDir, `ganache-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(updated, null, 2));
  console.log("✓ Backup saved:", `ganache-${stamp}.json`);

  console.log("\n=== COMPLETE M3 DEPLOYMENT ===");
  console.log(JSON.stringify(updated.contracts, null, 2));

  console.log("\nNext: copy these addresses to backend/.env and frontend/.env");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
