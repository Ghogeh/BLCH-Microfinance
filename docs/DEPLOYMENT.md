# EDL System Deployment Guide

**System:** Entrepreneurial Decentralised Ledger (EDL)  
**Dissertation:** Design and Evaluation of a Blockchain-Based Microfinance System for Unbanked Entrepreneurs  
**Author:** Carl Ghogeh Vezhugho | UBA25EP054 | University of Bamenda, NAHPI

---

## Prerequisites

Install these tools before attempting any deployment:

| Tool | Minimum Version | Install |
|---|---|---|
| Node.js | 20.0.0 | https://nodejs.org |
| PHP | 8.2 | https://www.php.net |
| Composer | 2.x | https://getcomposer.org |
| Docker | 24.x | https://www.docker.com |
| Docker Compose | 2.x | bundled with Docker Desktop |
| Git | any | https://git-scm.com |

---

## Option A — Docker Deployment (recommended, one command)

**This is the fastest way to run the complete system.**

```bash
# 1. Clone the repository
git clone <your-repo-url> edl-microfinance
cd edl-microfinance

# 2. Run the automated startup script
# (deploys contracts, starts all services, wires everything together)
bash scripts/docker-start.sh

# 3. Access the system
# Browser: http://localhost:3000    ← React frontend
# API:     http://localhost:8000    ← Laravel API
# Chain:   http://localhost:8545    ← Ganache node
```

The script does these steps automatically:
1. Starts Ganache with deterministic test accounts
2. Deploys all three smart contracts (IdentityRegistry, EDLAccessControl, LoanFactory)
3. Extracts contract addresses and injects them as environment variables
4. Builds and starts all Docker services (MySQL, Redis, Laravel, queue worker, event listener, Nginx)

**Stop everything:** `docker-compose down`  
**View logs:** `docker-compose logs -f`  
**Rebuild after code changes:** `docker-compose up --build`

---

## Option B — Manual Development Setup (five terminals)

Use this when you need to debug individual services or modify code.

### Terminal 1 — Ganache (blockchain node)

```bash
npm install -g ganache    # first time only
ganache \
  --mnemonic "test test test test test test test test test test test junk" \
  --port 8545 \
  --chain.chainId 1337 \
  --accounts 10
```

Keep this running. The ten pre-funded addresses are always the same —
Account[0] (`0xf39Fd6...`) is the admin/deployer.

### Terminal 2 — Deploy Smart Contracts

```bash
cd contracts
npm install                                               # first time only
npx hardhat compile
npx hardhat run scripts/deploy-all.js --network ganache
```

Output: three contract addresses. Copy them into:
- `backend/.env`  — `IDENTITY_REGISTRY_ADDRESS`, `EDL_ACCESS_CONTROL_ADDRESS`, `LOAN_FACTORY_ADDRESS`
- `frontend/.env` — `VITE_IDENTITY_REGISTRY_ADDRESS`, `VITE_LOAN_FACTORY_ADDRESS`

The addresses are also saved automatically to `contracts/deployments/ganache-latest.json`.

### Terminal 3 — Laravel Backend

```bash
cd backend
composer install          # first time only
cp .env.example .env
php artisan key:generate
# Edit .env — add contract addresses, DB credentials (see reference below)
php artisan migrate --seed
php artisan serve --port=8000
```

### Terminal 4 — Queue Worker + Blockchain Event Listener

```bash
cd backend
php artisan queue:work --queue=blockchain-events --sleep=3 --tries=3 &
php artisan edl:listen
```

The queue worker processes on-chain event jobs.  
The event listener polls Ganache for contract events and syncs MySQL.  
Both must be running for loan state to update automatically.

### Terminal 5 — React Frontend

```bash
cd frontend
npm install         # first time only
cp .env.example .env
# Edit .env — add API URL and contract addresses (see reference below)
npm run dev
```

Browser: http://localhost:5173 (Vite dev server with HMR)

---

## Environment Variables Reference

### backend/.env

```ini
# Application
APP_NAME=EDL-Microfinance
APP_ENV=local
APP_KEY=                        # php artisan key:generate
APP_DEBUG=true
APP_URL=http://localhost:8000

# Database
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=edl_db
DB_USERNAME=root
DB_PASSWORD=

# Cache & Queue (Redis)
CACHE_STORE=redis
QUEUE_CONNECTION=redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Blockchain (from contracts/deployments/ganache-latest.json)
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
IDENTITY_REGISTRY_ADDRESS=0x...
EDL_ACCESS_CONTROL_ADDRESS=0x...
LOAN_FACTORY_ADDRESS=0x...

# Admin wallet (Ganache Account[0] — NEVER commit real keys)
ADMIN_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### frontend/.env

```ini
VITE_API_URL=http://localhost:8000/api
VITE_CHAIN_ID=1337
VITE_RPC_URL=http://127.0.0.1:8545

# From contracts/deployments/ganache-latest.json
VITE_IDENTITY_REGISTRY_ADDRESS=0x...
VITE_LOAN_FACTORY_ADDRESS=0x...
```

---

## Test Accounts (Ganache deterministic)

All accounts are pre-funded with 1000 ETH on the local Ganache node.  
Mnemonic: `test test test test test test test test test test test junk`

| Index | Address | Suggested Role |
|---|---|---|
| [0] | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | Admin / Contract Deployer |
| [1] | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | MFI Officer |
| [2] | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | Entrepreneur (borrower) |
| [3] | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | Guarantor |
| [4] | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` | Lender (MFI/SACCO) |
| [5] | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` | Regulator (COBAC node) |

**MetaMask setup:** Import any account using its private key. Switch network to
Ganache (RPC: `http://127.0.0.1:8545`, Chain ID: `1337`).

---

## Running the Test Suites

### Smart Contract Tests (Hardhat)

```bash
cd contracts
npx hardhat test              # all 144 tests
npx hardhat coverage          # coverage report
```

Expected: 144 tests passing, ~97% statement coverage.

### Backend Tests (PHPUnit / Laravel)

```bash
cd backend
php artisan test              # all 27 tests
php artisan test --filter Auth  # subset
```

Expected: 27 tests passing, 55 assertions.  
**Requires:** MySQL running with `edl_db` and `edl_db_test` databases.

### Frontend Tests (Vitest)

```bash
cd frontend
npm run test                  # all 46 tests
npm run coverage              # with coverage report
```

Expected: 46 tests passing across 6 test files.

---

## Dissertation Validation Scenarios

After the full system is running, verify all 5 dissertation scenarios manually:

| Scenario | Description | Smart contract tests |
|---|---|---|
| §4.5.1 | Entrepreneur onboarding and loan creation | Scenario1_OnboardingLoanRequest.test.js |
| §4.5.2 | Atomic repayment and credit score update | Scenario2_RepaymentCreditScoring.test.js |
| §4.5.3 | COBAC forensic audit without institutional cooperation | Scenario3_RegulatoryAuditCEMAC.test.js |
| §3.4.3 (Step 3) | Multi-lender crowdfunding and escrow | Scenario4and5_CrowdfundingDefault.test.js |
| §3.4.3 (Step 6) | 90-day default, CEMAC blacklisting, network block | Scenario4and5_CrowdfundingDefault.test.js |

Run all scenario tests:

```bash
cd contracts
npx hardhat test  # includes all scenario files
```

---

## Troubleshooting

### Ganache accounts are different on each restart

Ganache with `--mnemonic` always produces the same 10 accounts.
If the addresses look different, you are missing the `--mnemonic` flag.
The mnemonic is: `test test test test test test test test test test test junk`

### "borrower not KYC verified" when contract addresses changed

Every fresh Ganache restart deploys contracts at new addresses.
You must re-run `deploy-all.js` and update both `.env` files after each restart.

### Laravel 401 on all API requests

The Sanctum token expires when the backend restarts because the `APP_KEY` generates
fresh encryption. If tokens stop working, log out in MetaMask and sign in again.

### `php artisan edl:listen` shows no events

Verify:
1. Ganache is running and contracts are deployed at the addresses in `backend/.env`
2. Redis is running (`redis-cli ping` → `PONG`)
3. The queue worker is running in a separate terminal

### MetaMask "Wrong Network" on login

MetaMask must be on Ganache's network. Add it manually:
- Network name: `EDL Ganache`
- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `1337`
- Currency: `ETH`

---

## Project Structure

```
edl-microfinance/
├── contracts/              Solidity smart contracts + Hardhat
│   ├── src/                IdentityRegistry, EDLAccessControl, LoanFactory, LoanContract
│   ├── test/               114 unit tests + 30 dissertation scenario tests
│   ├── scripts/            deploy-all.js (fresh deploy), deploy.js (M3 only)
│   └── deployments/        ganache-latest.json (auto-updated after deploy)
├── backend/                Laravel 11 API
│   ├── app/Services/       BlockchainService, KYCService, LoanFactoryService
│   ├── app/Http/           Controllers (Auth, KYC, Loan, Audit, Credit)
│   ├── app/Jobs/           ProcessBlockchainEvent (queue job)
│   └── tests/Feature/      27 PHPUnit integration tests
├── frontend/               React 18 + Vite SPA
│   ├── src/contexts/       WalletContext (MetaMask), AuthContext (Sanctum)
│   ├── src/pages/          10 role-specific pages
│   └── src/test/           46 Vitest unit tests
├── docker-compose.yml      7-service Docker stack
├── scripts/                docker-start.sh
└── docs/                   MILESTONES.md, PROGRESS.md, engineering journals
```

---

## Key Architecture Decisions

| Decision | Rationale |
|---|---|
| Permissioned Ganache (dev) / Besu (prod) | Cost-free testing; Besu for production CEMAC compliance |
| Laravel Sanctum (not JWT) | SPA-native, stateless Bearer token, zero external dependency |
| SHA-256 hash on-chain only | KYC documents stay off-chain (GDPR/CEMAC data protection) |
| Nonce challenge for auth | Eliminates password storage; ECDSA signature proves wallet ownership |
| React Query for data fetching | Automatic cache invalidation on mutation; credit score updates live |
| Minimal ABI fragments (not full artifacts) | Reduces frontend bundle by ~60 KB; all on-chain calls searchable in one file |
| `provideGuarantee()` open to any verified wallet | Flexible peer guarantee model matches informal CEMAC savings group structure |

---

*Generated: 2026-06-30 | EDL Microfinance v1.0 | Milestone M14 complete*
