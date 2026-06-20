const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EDLPlaceholder", function () {
  it("should deploy and return correct name", async function () {
    const Contract = await ethers.getContractFactory("EDLPlaceholder");
    const contract = await Contract.deploy();
    expect(await contract.name()).to.equal("EDL Microfinance");
  });
});
