const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying from:", deployer.address);
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(bal), "ETH");
  const EDL = await ethers.getContractFactory("EDLPlaceholder");
  const contract = await EDL.deploy();
  await contract.waitForDeployment();
  console.log("EDLPlaceholder deployed to:", await contract.getAddress());
  const name = await contract.name();
  console.log("Contract name:", name);
}

main().catch(console.error);
