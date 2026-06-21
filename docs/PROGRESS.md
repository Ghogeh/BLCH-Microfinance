# EDL Development Progress Log

> **Instructions for AI agents:** Before starting any work, read the most
> recent entries in this file to understand current project state. After
> completing work, append a new entry following the template below.
> NEVER delete or edit previous entries — this is an append-only log.

---

## Entry template (copy this for every new entry)

```
## YYYY-MM-DD — M{number} — Agent used: Claude / Codex / human

**Branch:** milestone/M{number}-{short-name}
**Status change:** not_started → in_progress | in_progress → complete

### What was done
- bullet list of completed tasks

### Decisions made
- Short description of the decision and why

### Blockers encountered
- None | description of any blockers

### Tests status
- e.g. "10 Hardhat tests passing, coverage 94%"

### Next session should start with
- Specific next action for the next agent or session
```

---

## Log entries (newest at the bottom)

## 2024-01-01 — M1 — Agent used: Claude (chat)

**Branch:** N/A (pre-branching)
**Status change:** not_started → complete

### What was done
- Initialized Git repository with comprehensive .gitignore
- Installed and verified all 5 tiers: React/Vite, Laravel 11, Hardhat,
  Ganache, MySQL
- Created complete folder structure with READMEs in each directory
- Configured vite.config.js with path aliases and Vitest
- Configured Laravel routes/api.php with all 18 planned endpoints
  (controllers not yet implemented — routes are stubs)

### Decisions made
- Chose Ganache deterministic mode with standard Hardhat mnemonic for
  reproducible test accounts across all agent sessions
- Used Redis for both cache and queue driver (not database driver) —
  required for blockchain event listener performance in M8

### Blockers encountered
- None

### Tests status
- N/A — no business logic written yet, only infrastructure

### Next session should start with
- Begin M4 (database migrations) since it has no dependencies and can
  run in parallel with M2 smart contract work

---

## 2024-01-02 — M4 — Agent used: Claude (chat)

**Branch:** milestone/M4-database (created retroactively)
**Status change:** not_started → complete

### What was done
- Created all 16 migration files in correct dependency order
- Added 5 immutability triggers (repayments x2, audit_log x2, loans x1)
- Created 10 Eloquent models with full relationships and helper methods
- Created DatabaseSeeder with 8 users and 2 loans (1 ACTIVE, 1 FUNDING)
- Verified migrate:fresh --seed runs clean with no errors

### Decisions made
- Stored loan amounts as amount_cfa (decimal) AND amount_wei (string)
  to support both human-readable display and exact on-chain reconciliation
  without float precision loss
- Made loan_funders NOT unique per (loan, funder) since a lender can
  top up their contribution multiple times — but loan_guarantors IS
  unique per (loan, guarantor) since you only guarantee a loan once

### Blockers encountered
- Initial users migration from Laravel's default scaffold conflicted
  with our custom wallet_address column — resolved by completely
  rewriting the migration file rather than adding a second migration

### Tests status
- No PHPUnit tests yet (will be added in M5 alongside auth)
- Manual tinker verification: all relationships load correctly

### Next session should start with
- Begin M2 (IdentityRegistry.sol) — this unblocks both M3 (loan
  contracts) and M6 (KYC API), so it is the highest-priority next step

---
