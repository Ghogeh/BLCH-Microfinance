require("@nomicfoundation/hardhat-toolbox");

// Ganache account [0] for mnemonic "test test test...junk" (m/44'/60'/0'/0/{index} path)
// Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
const PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

module.exports = {
  solidity: {
    version: "0.8.24", // bumped from 0.8.20 — OZ v5 Strings.sol requires ^0.8.24
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    ganache: {
      url: "http://127.0.0.1:8545",
      chainId: 1337,
      accounts: [PRIVATE_KEY]
    },
    besu_local: {
      url: "http://127.0.0.1:8545",
      chainId: 1337,
      accounts: [PRIVATE_KEY]
    }
  },
  paths: {
    sources:   "./src",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts"
  },
  gasReporter: {
    enabled:    true,
    currency:   "USD",
    outputFile: "gas-report.txt",
    noColors:   true,
  }
};
