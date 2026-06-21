# EDL Development Progress Log

> **Instructions for AI agents:** Before starting any work, read the most
> recent entries in this file to understand current project state. After
> completing work, append a new entry following the template below.
> NEVER delete or edit previous entries — this is an append-only log.

---

## Entry template (copy this for every new entry)

```
---
## Session — [DATE] | [MILESTONE] | Branch: [branch-name]
**Agent:** Claude Sonnet 4.6 (or Codex / human)
**Duration:** ~X hours
**Milestone status after this session:** ⬜ / 🟦 / ✅

### What was done
- bullet list of completed tasks

### Files created or modified
- path/to/file.ext — one-line description

### Decisions made
- Decision: [what] — Reason: [why]

### Bugs found and fixed
- Bug: [description] — Fix: [what changed]

### What the next agent session should do
- Specific next step
---
```

---

## Session — 2026-06-20 | M1 Environment Setup | Branch: master
**Agent:** Claude Sonnet 4.6
**Duration:** ~4 hours
**Milestone status after this session:** ✅ M1 Complete

### What was done
- Initialized Git monorepo with .gitignore covering node_modules, vendor, .env, artifacts
- Created complete documentation suite: README.md, REQUIREMENTS.md, requirements.json,
  ACTORS.md, USE_CASES.md, USER_STORIES.md, TECH_STACK.md
- Scaffolded React 18 + Vite frontend (pinned React 18 for MetaMask SDK compatibility)
- Installed all production deps: ethers.js v6, MetaMask SDK, React Query, Zustand,
  Axios, React Hook Form + Zod, Headless UI, Recharts, react-dropzone
- Installed dev deps: Tailwind CSS 3, ESLint 8, Prettier, Vitest, Testing Library
- Scaffolded Laravel 13 backend with Sanctum + Predis
- Initialized Hardhat workspace with Solidity 0.8.20 + OpenZeppelin v5
- Installed Ganache v7.9.2 globally
- Verified all 5 tiers communicating (Ganache RPC, Hardhat deploy, Laravel 401, Vite proxy, MySQL)

### Files created or modified
- README.md — master context document with architecture, actors, quick start
- docs/REQUIREMENTS.md — 18 FR + 10 NFR from dissertation §3.4
- docs/requirements.json — machine-readable requirements for AI agents
- docs/ACTORS.md — 6 actor definitions with cross-layer role mapping
- docs/USE_CASES.md — 10 use case specifications
- docs/USER_STORIES.md — 14 user stories across 4 actor roles
- docs/TECH_STACK.md — technology decision records with dissertation citations
- frontend/ — complete Vite React scaffold with Tailwind, ESLint, Prettier, Vitest
- frontend/vite.config.js — path aliases, API proxy, code splitting, Vitest config
- frontend/src/test/setup.js — MetaMask mock + ethers.js partial mock
- backend/ — Laravel 13 scaffold with Sanctum, MySQL, Redis queue
- backend/bootstrap/app.php — API routes wired, statefulApi() middleware, JSON 401 fix
- backend/routes/api.php — 25 routes for all 6 controller groups
- contracts/ — Hardhat workspace with hardhat.config.js, src/ path, Ganache network
- contracts/src/EDLPlaceholder.sol — smoke-test contract
- contracts/scripts/deploy-placeholder.js — verified Hardhat→Ganache connectivity

### Decisions made
- Decision: React 18 (not 19) — Reason: MetaMask SDK peer dependency requires ^18
- Decision: --legacy-peer-deps for MetaMask — Reason: react-native is optional peer dep, not used in web SPA
- Decision: Ganache account 0 key (not Hardhat default) — Reason: different HD derivation paths produce different addresses
- Decision: redirectGuestsTo() returns null for api/* — Reason: prevents RouteNotFoundException when unauthenticated

### Bugs found and fixed
- Bug: React 19 / MetaMask SDK peer conflict — Fix: pinned React to ^18.3.1 in package.json
- Bug: Ganache --deterministic + --mnemonic are mutually exclusive — Fix: removed --deterministic flag
- Bug: Hardhat default key (0xf39Fd6...) has 0 ETH on Ganache — Fix: updated config to use Ganache account 0 key
- Bug: Laravel api/* returns HTML redirect for 401 — Fix: redirectGuestsTo() in bootstrap/app.php

### What the next agent session should do
- Begin M4 (database) — run php artisan migrate:fresh --seed after all migrations are created
- Then begin M2 (IdentityRegistry) in a separate contracts/ session

---

## Session — 2026-06-20 | M4 Database | Branch: master (pre-branching)
**Agent:** Claude Sonnet 4.6
**Duration:** ~5 hours
**Milestone status after this session:** ✅ M4 Complete

### What was done
- Reset and rewrote users table migration with wallet_address, role ENUM,
  kyc_status, kyc_hash, blacklisted (CEMAC), institution_name, softDeletes
- Created 13 EDL business table migrations in correct FK dependency order
- Embedded 5 MySQL triggers (2 audit_log immutability, 2 repayment immutability,
  1 loan state forward-only) inside migration files
- Created 10 Eloquent models with full relationships, helper methods, query scopes
- Created DatabaseSeeder → UserSeeder (8 actors) + LoanSeeder (2 loans, realistic data)
- Verified full schema with migrate:fresh --seed and tinker relationship tests

### Files created or modified
- database/migrations/0001_01_01_000000_create_users_table.php — full rewrite
- database/migrations/2024_01_02_000001 through 000010 — all 10 EDL migrations
- app/Models/User.php — replaced default, added 13 relationships + role helpers
- app/Models/Loan.php — state machine helpers, scopes, 8 relationships
- app/Models/Repayment.php — append-only model, 2 relationships
- app/Models/CreditScore.php — getRating() helper, 2 relationships
- app/Models/KycDocument.php — status helpers, hidden file_path
- app/Models/LoanGuarantor.php, LoanFunder.php — pivot-style models
- app/Models/AuditLog.php — no updated_at, custom CREATED_AT constant
- app/Models/Blacklist.php — CEMAC fields, lift workflow
- app/Models/LoanNotification.php — explicit $table override
- database/seeders/DatabaseSeeder.php, UserSeeder.php, LoanSeeder.php

### Decisions made
- Decision: CHAR(64) for SHA-256 hashes — Reason: always exactly 64 chars; CHAR is more efficient than VARCHAR for fixed-length data
- Decision: VARCHAR(78) for Wei amounts — Reason: uint256 can exceed BIGINT max; string avoids overflow
- Decision: DECIMAL(15,2) for CFA amounts — Reason: exact decimal arithmetic; FLOAT/DOUBLE cause precision errors with money
- Decision: ENUM values UPPERCASE (OPEN/ACTIVE etc) — Reason: mirrors Solidity LoanState enum exactly, no translation layer
- Decision: protected $table = 'audit_log' and 'blacklist' — Reason: override Laravel's auto-pluralisation which produces wrong table names
- Decision: trigger inside migration not via tinker — Reason: manual tinker triggers are lost on migrate:fresh

### Bugs found and fixed
- Bug: Repayment migration used amount_cfa; model/seeder used amount_paid_cfa — Fix: updated migration column names to match model $fillable
- Bug: CreditScore migration used on_time_count; seeder used on_time_payments — Fix: updated migration to match model
- Bug: AuditLog::count() hits audit_logs table (wrong) — Fix: added protected $table = 'audit_log'
- Bug: Blacklist::count() hits blacklists table (wrong) — Fix: added protected $table = 'blacklist'
- Bug: trg_loan_state_forward_only lost after migrate:fresh — Fix: embedded trigger in 000002_create_loans_table.php migration

### What the next agent session should do
- M2: Create milestone/M2-identity-registry branch from develop
- Write contracts/src/access/Roles.sol, EDLAccessControl.sol, RBACModifiers.sol
- Write contracts/src/IdentityRegistry.sol with 5 core functions
- Write contracts/test/IdentityRegistry.test.js with ≥10 test cases
- M5 can start in parallel: Create milestone/M5-laravel-auth from develop

---

## Session — 2026-06-21 | Phase 6 Planning | Branch: develop
**Agent:** Claude Sonnet 4.6
**Duration:** ~1 hour
**Milestone status after this session:** 🟦 Phase 6 In Progress (planning complete)

### What was done
- Established Git branching strategy: master (production) → develop (integration) → milestone/* branches
- Created develop branch and pushed to origin
- Created docs/GIT_WORKFLOW.md with branch naming conventions and multi-agent rules
- Created docs/MILESTONES.md — complete 14-milestone roadmap with Definition of Done per milestone
- Created docs/milestones.json — machine-readable companion for AI agent consumption
- Created docs/PROGRESS.md — this append-only session log
- Added multi-agent parallelism guidance: safe pairs [M2,M5] and [M9,M6]

### Files created or modified
- docs/GIT_WORKFLOW.md — branch strategy, commit format, multi-agent rules
- docs/MILESTONES.md — 14 milestones with status, effort, dependencies, DoD checklists
- docs/milestones.json — machine-readable milestone tracker (valid JSON verified)
- docs/PROGRESS.md — this file

### Decisions made
- Decision: master not main as primary branch — Reason: repo was initialized before GitHub changed default; renaming is cosmetic and disruptive
- Decision: develop as integration branch — Reason: prevents unfinished milestone work from polluting production-ready master
- Decision: milestone/* branch prefix — Reason: groups branches by purpose, easy to see all active milestones at a glance

### Bugs found and fixed
- None this session

### What the next agent session should do
1. git checkout develop && git pull
2. git checkout -b milestone/M2-identity-registry
3. Create contracts/src/access/Roles.sol — bytes32 constants for all 6 roles
4. Create contracts/src/access/EDLAccessControl.sol — OpenZeppelin AccessControl base
5. Create contracts/src/access/RBACModifiers.sol — all role modifier definitions
6. Create contracts/src/IdentityRegistry.sol — registerIdentity, verifyIdentity, rejectIdentity, blacklistAddress, isVerified
7. Create contracts/test/IdentityRegistry.test.js — minimum 10 test cases
8. Run npx hardhat test — all tests must pass before merging

---
