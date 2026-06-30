/**
 * deploy-all.js — Full redeploy of all EDL contracts to a fresh Ganache instance.
 *
 * Deploys: IdentityRegistry → EDLAccessControl → LoanFactory
 * Then authorizes LoanFactory in IdentityRegistry for CEMAC blacklist callbacks.
 * Updates ganache-latest.json with all three addresses.
 */

const { ethers } = require("hardhat");
const fs   = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║         EDL Full Contract Redeploy           ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("Deployer:", deployer.address);
  console.log("Balance: ", ethers.formatEther(
    await ethers.provider.getBalance(deployer.address)
  ), "ETH\n");

  const network = await ethers.provider.getNetwork();
  console.log("Network: chainId", network.chainId.toString(), "\n");

  // ── 1. Deploy IdentityRegistry ────────────────────────────────────────────
  console.log("1/3 Deploying IdentityRegistry...");
  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const registry = await IdentityRegistry.deploy(deployer.address);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("    ✓ IdentityRegistry:", registryAddress);
  // deployer is already an officer (set in constructor)
  console.log("    ✓ Deployer is officer by default (constructor sets isOfficer[owner]=true)");

  // ── 2. Deploy EDLAccessControl ────────────────────────────────────────────
  console.log("\n2/3 Deploying EDLAccessControl...");
  const EDLAccessControl = await ethers.getContractFactory("EDLAccessControl");
  const accessControl = await EDLAccessControl.deploy(registryAddress, deployer.address);
  await accessControl.waitForDeployment();
  const accessControlAddress = await accessControl.getAddress();
  console.log("    ✓ EDLAccessControl:", accessControlAddress);

  // ── 3. Deploy LoanFactory ─────────────────────────────────────────────────
  console.log("\n3/3 Deploying LoanFactory...");
  const LoanFactory = await ethers.getContractFactory("LoanFactory");
  const factory = await LoanFactory.deploy(
    registryAddress,
    accessControlAddress,
    deployer.address
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("    ✓ LoanFactory:", factoryAddress);

  // ── 4. Authorize LoanFactory in IdentityRegistry ──────────────────────────
  console.log("\nAuthorizing LoanFactory for CEMAC blacklist callbacks...");
  const authTx = await registry.setAuthorizedContract(factoryAddress, true);
  await authTx.wait();
  const isAuth = await registry.authorizedContracts(factoryAddress);
  if (!isAuth) {
    console.error("CRITICAL: Authorization failed!");
    process.exit(1);
  }
  console.log("    ✓ LoanFactory authorized in IdentityRegistry");

  // ── 5. Write deployment record ─────────────────────────────────────────────
  const deploymentsDir = path.join(__dirname, "../deployments");
  const latestPath     = path.join(deploymentsDir, "ganache-latest.json");

  const deployment = {
    network:     "ganache",
    chainId:     Number(network.chainId),
    deployedAt:  new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    deployer:    deployer.address,
    milestone:   "M3",
    contracts: {
      IdentityRegistry: registryAddress,
      EDLAccessControl: accessControlAddress,
      LoanFactory:      factoryAddress,
    },
  };

  fs.writeFileSync(latestPath, JSON.stringify(deployment, null, 2));

  const stamp      = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = path.join(deploymentsDir, `ganache-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(deployment, null, 2));

  // ── 6. Print env update instructions ─────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║              DEPLOYMENT COMPLETE             ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(JSON.stringify(deployment.contracts, null, 2));

  console.log("\n▶ Update backend/.env with:");
  console.log(`ADMIN_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`);
  console.log(`IDENTITY_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`EDL_ACCESS_CONTROL_ADDRESS=${accessControlAddress}`);
  console.log(`LOAN_FACTORY_ADDRESS=${factoryAddress}`);

  console.log("\n▶ Update frontend/.env with:");
  console.log(`VITE_IDENTITY_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`VITE_LOAN_FACTORY_ADDRESS=${factoryAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
