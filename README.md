# EDL — Entrepreneurial Decentralised Ledger

A permissioned blockchain-based microfinance system designed to eliminate
data silos, provide portable credit histories, and enforce the 2026 CEMAC
Blacklisting Regulation for unbanked entrepreneurs in Cameroon.



---

## The Problem This System Solves

Cameroonian microfinance institutions keep borrower records locked in
private databases. An entrepreneur who repays faithfully at MFI-A is
treated as a first-time unknown risk at MFI-B. This "reputation lock-in"
forces repeated expensive KYC checks, drives interest rates to 24–80% APR,
and excludes 3.7 million informal entrepreneurs from affordable credit.

## The Solution

A permissioned blockchain consortium where MFIs share an immutable,
tamper-evident ledger. Smart contracts automate the full loan lifecycle.
Borrowers own a portable cryptographic credit history that travels with
them across institutions.

---

## System Architecture

Five tiers:
1. Presentation  — React 18 SPA + MetaMask wallet
2. Application   — Laravel 11 REST API + Sanctum auth
3. Smart Contract — Solidity 0.8.20 (LoanFactory + LoanContract + IdentityRegistry)
4. Blockchain    — Ganache (dev) → Hyperledger Besu PoA (production)
5. Data          — MySQL 8.0 (off-chain) + IPFS (documents)

## Six System Actors

| Actor | Role |
|---|---|
| Entrepreneur | Borrows, repays, builds portable credit history |
| Lender | MFI/SACCO/individual — funds loans |
| MFI Officer | Validates KYC, approves loans |
| Regulator | COBAC/BEAC — read-only audit node |
| Guarantor | Peer group member — provides social collateral |
| Admin | Consortium deployer — manages network |

## Loan Lifecycle States

```
OPEN → FUNDING → ACTIVE → REPAID
                        ↘ DEFAULTED (→ CEMAC blacklist if 90+ days)
```

---

## Prerequisites

- Node.js >= 20.0.0
- PHP >= 8.2 + Composer
- MySQL 8.0
- Git

## Quick Start

```bash
# 1. Clone
git clone <repo-url> edl-microfinance && cd edl-microfinance

# 2. Start Ganache (Terminal 1)
ganache --deterministic --port 8545

# 3. Deploy contracts (Terminal 2)
cd contracts && npm install && npx hardhat compile
npx hardhat run scripts/deploy.js --network ganache

# 4. Backend (Terminal 3)
cd backend && composer install
cp .env.example .env && php artisan key:generate
php artisan migrate --seed && php artisan serve

# 5. Queue worker (Terminal 4)
php artisan queue:work

# 6. Frontend (Terminal 5)
cd frontend && npm install && npm run dev
```

## Project Structure

```
edl-microfinance/                       ← monorepo root
│
├── contracts/                          ← Solidity / Hardhat workspace
│   ├── contracts/
│   │   ├── LoanFactory.sol             ← deploys per-loan child contracts
│   │   ├── LoanContract.sol            ← loan lifecycle state machine
│   │   └── IdentityRegistry.sol        ← on-chain KYC & CEMAC blacklist
│   ├── scripts/
│   │   └── deploy.js                   ← deployment script (Ganache + Besu)
│   ├── test/                           ← Hardhat/Mocha unit tests
│   ├── hardhat.config.js
│   └── package.json
│
├── backend/                            ← Laravel 11 REST API
│   ├── app/
│   │   ├── Http/
│   │   │   ├── Controllers/
│   │   │   │   ├── AuthController.php
│   │   │   │   ├── LoanController.php
│   │   │   │   ├── UserController.php
│   │   │   │   └── BlockchainController.php
│   │   │   └── Middleware/
│   │   ├── Models/
│   │   │   ├── User.php
│   │   │   ├── Loan.php
│   │   │   └── CreditHistory.php
│   │   ├── Services/
│   │   │   ├── BlockchainService.php   ← web3.php bridge to contracts
│   │   │   └── IpfsService.php         ← document pinning
│   │   └── Jobs/
│   │       └── SyncBlockchainEvents.php ← queue worker for event indexing
│   ├── database/
│   │   ├── migrations/
│   │   └── seeders/
│   ├── routes/
│   │   └── api.php
│   ├── .env.example
│   └── composer.json
│
├── frontend/                           ← React 18 SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── loan/                   ← loan creation, funding, repayment UI
│   │   │   ├── dashboard/              ← role-specific dashboards
│   │   │   └── wallet/                 ← MetaMask connection
│   │   ├── hooks/
│   │   │   ├── useContract.js          ← ethers.js contract bindings
│   │   │   └── useAuth.js
│   │   ├── pages/
│   │   ├── services/
│   │   │   └── api.js                  ← Axios client → Laravel API
│   │   └── main.jsx
│   ├── public/
│   ├── .env.example
│   ├── vite.config.js
│   └── package.json
│
├── docs/                               ← architecture diagrams, dissertation assets
│   ├── architecture.md
│   ├── api-spec.yaml                   ← OpenAPI 3.1 spec
│   └── diagrams/
│
├── .gitignore
└── README.md                           ← you are here
```

---

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Blockchain layer | Ganache dev → Hyperledger Besu PoA prod | Permissioned network: COBAC-approved MFIs only; no public mining costs |
| Auth | Laravel Sanctum (SPA tokens) | Stateless API, MetaMask signs blockchain txns separately |
| Off-chain DB | MySQL 8.0 | Queryable loan metadata, user profiles; immutable source-of-truth stays on-chain |
| Document storage | IPFS | Content-addressed KYC docs; hash stored on-chain for tamper evidence |
| Event sync | Laravel queue worker | Indexes `LoanFunded`, `RepaymentMade`, `Defaulted` events into MySQL for fast queries |
| CEMAC enforcement | `IdentityRegistry.sol` | Blacklisting is on-chain and consortium-wide; no single MFI can override |

## Smart Contract Overview

### `IdentityRegistry.sol`
Stores a borrower's on-chain identity (address → national ID hash). The
Admin or Regulator can call `blacklist(address)` when a loan enters
`DEFAULTED` state for 90+ days, triggering the 2026 CEMAC regulation.

### `LoanFactory.sol`
Deployed once per consortium. MFI Officers call `createLoan(borrower,
amount, termDays, interestBps)` which deploys a new `LoanContract`
instance and emits `LoanCreated`.

### `LoanContract.sol`
Per-loan state machine. State transitions:
- `fund()` — Lenders send ETH/token; moves `OPEN → FUNDING → ACTIVE`
- `repay()` — Borrower repays instalments
- `markDefaulted()` — Callable by MFI Officer after 90-day grace period

## API Conventions

- Base URL: `http://localhost:8000/api/v1`
- Auth header: `Authorization: Bearer <sanctum-token>`
- All timestamps: ISO 8601 UTC
- Amounts: integer cents (XAF) — never floating point
- Blockchain tx hashes returned in responses for auditability

## Environment Variables (backend/.env.example)

```
APP_KEY=                        # php artisan key:generate
DB_DATABASE=edl_microfinance
DB_USERNAME=root
DB_PASSWORD=

BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
LOAN_FACTORY_ADDRESS=           # set after deploy.js
IDENTITY_REGISTRY_ADDRESS=      # set after deploy.js
DEPLOYER_PRIVATE_KEY=           # Ganache account #0 key — NEVER commit a real key

IPFS_API_URL=http://127.0.0.1:5001
QUEUE_CONNECTION=database
```

## Testing

```bash
# Smart contract unit tests
cd contracts && npx hardhat test

# Backend feature tests (requires running MySQL)
cd backend && php artisan test

# Frontend component tests
cd frontend && npm test
```

## Regulatory Context

The **2026 CEMAC Microfinance Blacklisting Regulation** requires all MFIs
operating in the CEMAC zone (Cameroon, Chad, CAR, Congo, Equatorial Guinea,
Gabon) to share defaulter records via an interoperable registry. EDL
implements this requirement on-chain: a blacklist entry in
`IdentityRegistry.sol` is visible to every consortium node the moment the
transaction is confirmed, with no central database operator who can suppress
or delay the record.

## Dissertation Milestones

| Phase | Deliverable | Status |
|---|---|---|
| 1 | Monorepo scaffold + smart contract skeleton | In progress |
| 2 | `IdentityRegistry` + `LoanFactory` tests passing | Pending |
| 3 | Laravel API + blockchain bridge | Pending |
| 4 | React SPA + MetaMask integration | Pending |
| 5 | Besu PoA testnet deployment | Pending |
| 6 | Load testing + dissertation write-up | Pending |

## Documentation

- [Requirements](docs/REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Smart Contracts](docs/CONTRACTS.md)
- [Deployment](docs/DEPLOYMENT.md)

---

> **AI Coding Agent Note:** This README is the authoritative context document.
> The five-tier architecture is fixed. Do not suggest migrating to a different
> framework stack. The MySQL off-chain database and the Solidity on-chain
> contracts serve different roles and both are required. CEMAC blacklisting
> logic must always live in `IdentityRegistry.sol`, not in application code.
