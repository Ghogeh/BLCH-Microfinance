const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying EDL M2 contracts with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");
  console.log("");

  // 1. Deploy IdentityRegistry — the foundation contract
  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const identityRegistry = await IdentityRegistry.deploy(deployer.address);
  await identityRegistry.waitForDeployment();
  const identityRegistryAddress = await identityRegistry.getAddress();
  console.log("✓ IdentityRegistry deployed to:", identityRegistryAddress);

  // 2. Deploy EDLAccessControl — depends on IdentityRegistry
  const EDLAccessControl = await ethers.getContractFactory("EDLAccessControl");
  const accessControl = await EDLAccessControl.deploy(identityRegistryAddress, deployer.address);
  await accessControl.waitForDeployment();
  const accessControlAddress = await accessControl.getAddress();
  console.log("✓ EDLAccessControl deployed to:", accessControlAddress);

  console.log("");
  console.log("Deployment complete. Saving addresses...");

  const network = await ethers.provider.getNetwork();
  const deployment = {
    network: network.chainId === 1337n ? "ganache" : network.name,
    chainId: Number(network.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    milestone: "M2",
    contracts: {
      IdentityRegistry: identityRegistryAddress,
      EDLAccessControl: accessControlAddress,
    },
  };

  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const outPath = path.join(deploymentsDir, "ganache-latest.json");
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));

  console.log("✓ Saved to contracts/deployments/ganache-latest.json");
  console.log("");
  console.log(JSON.stringify(deployment, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
