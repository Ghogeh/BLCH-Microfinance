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

Addresses are also saved to `contracts/deployments/ganache-latest.json`.

### Terminal 3 — Laravel Backend

```bash
cd backend
composer install          # first time only
cp .env.example .env
php artisan key:generate
# Edit .env — add contract addresses and DB credentials
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
# Edit .env — add API URL and contract addresses
npm run dev
```

Browser: http://localhost:5173 (Vite dev server with HMR)

---

## Environment Variables Reference

### backend/.env

```ini
APP_NAME=EDL-Microfinance

APP_KEY=base64:...       # generate with: php artisan key:generate

APP_URL=http://localhost:8000
DB_CONNECTION=mysql

DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=edl_db
DB_USERNAME=root
DB_PASSWORD=

CACHE_STORE=redis
QUEUE_CONNECTION=redis
REDIS_HOST=127.0.0.1

BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545

IDENTITY_REGISTRY_ADDRESS=0x...   # from deploy-all.js output
EDL_ACCESS_CONTROL_ADDRESS=0x...  # from deploy-all.js output
LOAN_FACTORY_ADDRESS=0x...        # from deploy-all.js output

ADMIN_PRIVATE_KEY=0xac0974...     # Ganache Account[0] private key
```

### frontend/.env

```ini
VITE_API_URL=http://localhost:8000/api

VITE_CHAIN_ID=1337
VITE_RPC_URL=http://127.0.0.1:8545

VITE_IDENTITY_REGISTRY_ADDRESS=0x...
VITE_LOAN_FACTORY_ADDRESS=0x...
```

---

## Test Accounts (Ganache Deterministic)

Mnemonic: `test test test test test test test test test test test junk`  
All accounts pre-funded with 1,000 ETH.

| Account | Suggested Role | Address | Private Key |
|---|---|---|---|
| Account[0] | Admin / Deployer | `0xf39Fd6e5...` | `0xac0974be...` |
| Account[1] | Entrepreneur | `0x70997970...` | `0x59c6995e...` |
| Account[2] | Lender | `0x3C44CdDd...` | `0x5de4111a...` |
| Account[3] | MFI Officer | `0x90F79bf6...` | `0x7c852118...` |
| Account[4] | Regulator (COBAC) | `0x15d34AAf...` | `0x47e179ec...` |
| Account[5] | Guarantor | `0x9965507D...` | `0x8b3a350c...` |

Add accounts to MetaMask by importing the private keys.  
**These are public test keys — never use on mainnet.**

Full private keys available in Ganache startup output or `contracts/hardhat.config.js`.

---

## MetaMask Configuration

1. Open MetaMask → Networks → Add Network (manually)
2. **Network Name:** EDL Ganache
3. **RPC URL:** `http://127.0.0.1:8545`
4. **Chain ID:** `1337`
5. **Currency Symbol:** `ETH`
6. Import test accounts using private keys from the table above

---

## Running Tests

```bash
# Smart contract unit tests + all 5 dissertation scenarios (144 tests)
cd contracts && npx hardhat test

# Smart contract coverage report
cd contracts && npx hardhat coverage

# Backend API integration tests (27 tests)
cd backend && php artisan test

# Frontend unit tests (46 tests)
cd frontend && npm run test

# Full test report — save to file for dissertation appendix
cd contracts && npx hardhat test 2>&1 | tee test-report.txt
```

---

## Dissertation Validation Scenarios

| # | Reference | Description | Test File |
|---|---|---|---|
| 1 | §4.5.1 | Entrepreneur onboarding and loan creation | `Scenario1_OnboardingLoanRequest.test.js` |
| 2 | §4.5.2 | Atomic repayment and credit score update | `Scenario2_RepaymentCreditScoring.test.js` |
| 3 | §4.5.3 | COBAC forensic audit, no institutional cooperation | `Scenario3_RegulatoryAuditCEMAC.test.js` |
| 4 | §3.4.3 Step 3 | Multi-lender crowdfunding and escrow disbursement | `Scenario4and5_CrowdfundingDefault.test.js` |
| 5 | §3.4.3 Step 6 | 90-day default, CEMAC blacklisting, network block | `Scenario4and5_CrowdfundingDefault.test.js` |

---

## Common Issues

**"Ganache connection refused"**  
→ Start Ganache in Terminal 1 before anything else.

**"Contract addresses not found in .env"**  
→ Run `deploy-all.js` and copy the output addresses to both `.env` files.

**"MetaMask: wrong network"**  
→ Switch MetaMask to the EDL Ganache network (Chain ID: 1337).

**`php artisan migrate` fails**  
→ Ensure MySQL is running and `edl_db` database exists.  
→ Create it: `mysql -u root -e "CREATE DATABASE edl_db;"`

**"Event listener not syncing"**  
→ Ensure both `php artisan queue:work` AND `php artisan edl:listen` are running.  
→ Check Redis: `redis-cli ping` should return `PONG`.

**"borrower not KYC verified" error after Ganache restart**  
→ Contracts are reset on every Ganache restart. Re-run `deploy-all.js` and update both `.env` files.

---

## Production Notes (Hyperledger Besu)

For production deployment on Hyperledger Besu PoA:

1. Replace Ganache with Besu in `hardhat.config.js` networks section
2. Update `BLOCKCHAIN_RPC_URL` to the Besu node RPC endpoint
3. Replace the `ganache` service in `docker-compose.yml` with the Besu container
4. All smart contracts deploy identically to Besu — no Solidity changes required
5. Gas costs approach zero on PoA consensus — NFR-007 cost target maintained

Besu configuration reference: `blockchain/besu-config/` (M14 extension)

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
├── scripts/                docker-start.sh (automated startup)
└── docs/                   MILESTONES.md, PROGRESS.md, engineering journals
```

---

*Generated: 2026-06-30 | EDL Microfinance v1.0 | MSc Computer Engineering | University of Bamenda, NAHPI*
