require("@nomicfoundation/hardhat-toolbox");

// Ganache account [0] for mnemonic "test test test...junk" (m/44'/60'/0'/0 derivation)
// Address: 0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1
const PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY ||
  "0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d";

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
