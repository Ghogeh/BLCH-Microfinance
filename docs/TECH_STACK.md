# EDL Technology Stack Decisions

## Frontend: React 18 + Vite + ethers.js 6

**Decision:** React 18 with Vite build tool
**Justification:** Explicitly specified in dissertation §3.3.2. React's component
model maps directly to role-based views (BorrowerDashboard, LenderDashboard, etc.).
Vite provides <500ms HMR for rapid iteration.

**ethers.js v6 over Web3.js:**
ethers.js is lighter (~120KB vs ~590KB), has better TypeScript types, uses
modern ESM modules, and is the standard for MetaMask integration in 2024–2025.
The dissertation references ethers.js/Web3.js — we choose ethers.js v6.

**MetaMask SDK over raw window.ethereum:**
The SDK handles mobile deep-links, QR code fallback for Cameroonian users without
desktop browsers, and connection persistence across page reloads. Critical for
the low-digital-literacy user requirement (NFR-005).

---

## Backend: Laravel 11 (PHP 8.2)

**Decision:** Laravel 11 with Sanctum authentication
**Justification:** Explicitly specified in dissertation §3.3.2. Laravel's Eloquent
ORM maps cleanly to the 16-table MySQL schema. Sanctum provides token-based auth
compatible with both the React SPA and potential USSD/mobile fallbacks.

**Queue system:** Laravel Queues with Redis driver
Required for the blockchain event listener (NFR-010). When LoanDisbursed fires
on-chain, the Laravel queue worker processes it asynchronously without blocking
the API response. Redis provides sub-millisecond queue throughput.

---

## Smart Contracts: Solidity 0.8.20 + Hardhat

**Decision:** Solidity 0.8.20 with Hardhat development environment
**Justification:** Solidity is the only language for Ethereum-compatible smart
contracts. v0.8.20 includes built-in overflow protection (no SafeMath needed)
and immutable variables. Hardhat over Truffle: better debugging (console.log
in Solidity), faster compilation, and maintained by Nomic Foundation.

**OpenZeppelin v5:** Battle-tested security libraries. ReentrancyGuard prevents
the reentrancy attack in fund()→_disburse(). AccessControl provides the RBAC
foundation. Ownable for administrative functions.

---

## Blockchain Network: Ganache (dev) → Hyperledger Besu (production)

**Decision:** Ganache for development; Hyperledger Besu PoA for production
**Justification (from dissertation §3.4.2):**
- Public chains (Ethereum mainnet): unpredictable gas fees make microtransactions
  economically unviable. A repayment on congested mainnet could cost more than
  the instalment itself.
- Private chains: replicate centralised control; no decentralisation benefit.
- Permissioned (Besu PoA): fixed-cost consensus, KYC/AML compliance, identifiable
  nodes, COBAC can run a validator node, and throughput >100 TPS.

Ganache is chosen for development because: 1-second block times for rapid testing,
pre-funded test accounts, zero gas fees, perfect for dissertation prototype scope.

---

## Database: MySQL 8.0

**Decision:** MySQL 8.0 as the off-chain relational database
**Justification:** Dissertation §3.3.2 specifies MySQL. The off-chain + on-chain
hash anchor pattern requires a relational DB to mirror blockchain state for fast
queries. On-chain queries are slow and gas-costly; MySQL provides sub-millisecond
reads for the React dashboards.

PII and documents are stored ONLY off-chain (NFR-009). Only SHA-256 hashes go
on-chain. MySQL enforces this at the schema level via constraints and triggers.
