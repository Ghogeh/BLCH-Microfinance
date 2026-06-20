# EDL Project — Engineering Journal
## A Senior-to-Intern Walkthrough: Every Decision, Every Problem, Every Fix

**Project:** EDL — Entrepreneurial Decentralised Ledger
**Author:** Carl Ghogeh Vezhugho (UBA25EP054)
**Journal written by:** AI Pair Programmer (Claude Sonnet 4.6)
**Audience:** Yourself, future collaborators, dissertation examiners
**Date:** June 2026

---

> This document explains, in plain language, every engineering and scientific
> decision made from the very first file to a fully running development environment.
> Nothing is assumed. If you are reading this six months from now and have forgotten
> why something was done — this document has the answer.

---

## PART 1 — THE PROBLEM SPACE (Why This Project Exists)

### 1.1 The Real-World Problem

Before writing a single line of code, you need to deeply understand the
problem you are solving — because every technical decision flows from it.

In Cameroon (and across the CEMAC economic zone), there are roughly
**3.7 million informal entrepreneurs** — market traders, artisans, transport
operators — who borrow money from Microfinance Institutions (MFIs) such as
credit unions and SACCOs.

Here is the core problem: **each MFI keeps its borrower records in its own
private database.** This creates what we call a **data silo**.

**What happens because of this:**

Imagine a trader named Amina. She has borrowed from MFI-Alpha three times and
repaid every loan on time. She is an excellent borrower. Now she wants a larger
loan — more than MFI-Alpha can offer — so she approaches MFI-Beta.

MFI-Beta has never heard of Amina. As far as their database is concerned, she
does not exist. They cannot see her three perfect repayments. So they treat her
as a brand-new, unknown-risk borrower. They demand the same expensive KYC
(Know Your Customer) checks all over again, charge high interest rates (24–80%
APR in practice), and may even reject her.

Her three years of good financial behaviour **are locked inside MFI-Alpha's
private database** and cannot travel with her. This is called **reputation
lock-in**.

**The regulatory dimension:**

The 2026 CEMAC Blacklisting Regulation adds another layer. COBAC (the banking
regulator for the CEMAC zone) now requires all MFIs to share records of
defaulters — borrowers who have not repaid for 90+ days. But with siloed
databases, there is no reliable way to do this. A defaulter at MFI-Alpha can
walk into MFI-Beta and borrow again, because MFI-Beta has no access to that
information.

### 1.2 Why Blockchain? (The Scientific Reasoning)

Many students hear "blockchain" and think it is just a trendy word. Let me
explain exactly why it is the correct engineering tool for this specific problem.

The problem requires a system where:
1. **Multiple organisations** (different MFIs) must share data
2. **No single organisation** should control or be trusted with that data
3. Records must be **impossible to alter** after they are written
4. All participants must see the **same version** of the data at the same time

A normal shared database (like a central MySQL server) fails requirement 2. If
one MFI hosts the database, the others must trust that MFI not to alter records.
That is a political and legal problem, not just a technical one.

A blockchain solves this with **cryptographic immutability**. Each record is
hashed (converted to a fixed-length fingerprint using SHA-256) and chained to
the previous record. If anyone tries to change an old record, every hash after
it breaks — and all other participants' copies would immediately disagree. The
tampering becomes mathematically detectable.

**Why permissioned, not public?**

There are two kinds of blockchains:

| Type | Example | How it works |
|---|---|---|
| Public | Ethereum mainnet | Anyone can join; consensus by thousands of anonymous computers |
| Permissioned | Hyperledger Besu | Only approved members can join; consensus by known, identified nodes |

For EDL, public blockchain has two fatal problems:
1. **Gas fees:** Every transaction on Ethereum mainnet costs money (gas). A
   borrower making a small repayment could pay more in gas than the repayment
   itself. This makes microfinance economically impossible on public chains.
2. **Privacy compliance:** COBAC/BEAC regulations require that participant
   identities be known and auditable. Anonymous public blockchains contradict
   this requirement.

A **permissioned blockchain** (specifically Hyperledger Besu with Proof-of-Authority
consensus) solves both: near-zero transaction costs because the validators are
known and pre-approved, and full regulatory compliance because all node operators
are identified institutions.

---

## PART 2 — ARCHITECTURE DECISIONS (Before Any Code Was Written)

### 2.1 The Five-Tier Architecture

Before writing any code, we defined the system's five layers. This is standard
systems engineering practice — you define the architecture first so that every
piece of code knows where it belongs.

```
Tier 1: Presentation   — What the user sees (React + MetaMask)
Tier 2: Application    — Business logic API (Laravel)
Tier 3: Smart Contract — Blockchain rules (Solidity)
Tier 4: Blockchain     — The distributed ledger (Ganache → Besu)
Tier 5: Data           — Storage (MySQL + IPFS)
```

**Why this separation matters:**

This is called a **separation of concerns** — a foundational principle of
software engineering. Each tier has one job and communicates with adjacent tiers
through defined interfaces. This means:

- You can change the frontend (React → mobile app) without touching the contracts
- You can upgrade the blockchain (Ganache → Besu) without changing the React code
- You can swap the database (MySQL → PostgreSQL) without touching Solidity

### 2.2 The Off-Chain / On-Chain Data Split

This is one of the most important design decisions in the entire project.
**Not everything goes on the blockchain.**

| Data | Where it lives | Why |
|---|---|---|
| SHA-256 hash of KYC document | On-chain (IdentityRegistry.sol) | Proves the document existed at a point in time; tamper-evident |
| The actual KYC document (PDF/photo) | Off-chain (encrypted file storage) | Blockchain storage is expensive; PII must not be public |
| Loan amount, duration, interest rate | On-chain (LoanContract.sol) | The financial terms must be immutable |
| Borrower's name, phone number | Off-chain (MySQL users table) | Personal data; privacy law compliance |
| Repayment history hash | On-chain | Portable credit passport that travels between MFIs |
| Loan status (OPEN/ACTIVE/etc.) | On-chain | State transitions must be auditable |

**The engineering principle:** The blockchain is an **audit trail and trust
anchor**, not a database. You anchor commitments on-chain (hashes, state
transitions, amounts) and store bulk data off-chain, linked by those anchors.

### 2.3 The Three Smart Contracts and Why Three

We decided on three contracts, not one, because of a principle called
**Single Responsibility** — each contract should do exactly one thing.

**IdentityRegistry.sol** — manages WHO is on the system
- Stores the SHA-256 hash of each borrower's identity documents
- Controls the blacklist (CEMAC compliance)
- Reason for separation: identity management is consortium-wide and permanent;
  it must outlive any individual loan

**LoanFactory.sol** — manages CREATING loans
- A factory is a design pattern where one contract deploys other contracts
- Each call to `createLoan()` deploys a fresh LoanContract instance
- Reason for separation: the factory is deployed once; individual loans come
  and go

**LoanContract.sol** — manages ONE loan's entire lifecycle
- One instance per loan; contains the escrow, repayment history, reputation score
- Reason for separation: if all loans were in one contract, a bug in one loan's
  logic could affect all loans on the system

---

## PART 3 — DOCUMENTATION BEFORE CODE (The Professional Approach)

### 3.1 Why We Wrote Docs First

A common mistake junior developers make is opening a code editor immediately.
Professional engineers write documentation first because:

1. **It forces clarity** — you cannot write a requirements document for
   something you do not understand
2. **It creates a contract** — everyone (you, your supervisor, future AI
   coding agents) knows exactly what to build
3. **It prevents scope creep** — without written requirements, every new idea
   feels like a "quick addition"

We created six documentation files before a single line of application code:

### 3.2 README.md — The Master Context Document

**What it is:** The first file any human or AI reads about the project.

**Engineering decision:** We included an "AI Coding Agent Note" at the bottom
explicitly stating:
- The five-tier architecture is FIXED
- Do not suggest switching frameworks
- CEMAC blacklisting logic must stay in `IdentityRegistry.sol`

**Why:** AI coding tools (including the one writing this) are trained to
suggest "improvements." Without these constraints, a future AI agent might
suggest moving to Next.js, or implementing blacklisting in the Laravel
database instead of the smart contract. The README guards against this.

### 3.3 REQUIREMENTS.md — The Software Requirements Specification (SRS)

**What it is:** A formal document listing every feature the system MUST have.

**Engineering decision:** We split requirements into two types:

**Functional Requirements (FR)** — what the system must DO
Example: FR-005: "Lender calls fund(); contract escrows ETH; auto-disburses
when totalFunded >= loanAmount"

**Non-Functional Requirements (NFR)** — how well the system must do it
Example: NFR-004: "Block confirmation time <5 seconds"

**Why this matters:** A common failure mode in student projects is building
something that works but not understanding the measurable success criteria.
NFR-004 tells you exactly what to test. NFR-009 ("zero PII bytes on-chain")
gives you a clear pass/fail test for privacy compliance.

### 3.4 requirements.json — Machine-Readable Requirements

**What it is:** The same requirements in JSON format.

**Why we made two formats:** The markdown file is for humans to read. The JSON
file is for AI coding agents, test scripts, and future automated tools to parse
programmatically. An AI agent can `import requirements.json` and verify it has
implemented every API endpoint listed there, without reading prose.

### 3.5 ACTORS.md — The Six System Roles

**Engineering decision:** We defined roles across FOUR layers simultaneously:

```
MySQL: users.role ENUM('entrepreneur','lender','officer','regulator','admin')
Laravel: route middleware → role:entrepreneur
Solidity: bytes32 constant = keccak256("ENTREPRENEUR")
React: <RequireRole role="ENTREPRENEUR" />
```

**Why all four?** This is called **defence in depth** — security enforced at
multiple independent layers. Even if the React route guard is bypassed (by a
technically savvy user editing browser code), the Laravel middleware blocks the
API call. Even if the API is bypassed (by direct RPC call), the smart contract
requires the wallet address to hold the correct role on-chain.

**The Guarantor dual-role nuance:** A Guarantor is also an Entrepreneur in the
database (same row, same role value). But in Solidity, the GUARANTOR role is
separate. This is because on-chain, a wallet can hold multiple roles — and you
need to distinguish "I am guaranteeing someone else's loan" from "I am the
borrower of this loan." This was a subtle but important design decision.

### 3.6 USE_CASES.md and USER_STORIES.md

**Use cases** describe complete system interactions (actor + system + outcome).
**User stories** describe the same interactions from the user's emotional
perspective ("As an entrepreneur, I want to... so that I can...").

**Why both?** The use cases are for engineers building the system. The user
stories are for the dissertation — they demonstrate you understand the human
impact of the technology, which is a key assessment criterion.

---

## PART 4 — FRONTEND SETUP (React + Vite)

### 4.1 The React Version Problem (Our First Bug)

**What happened:** When we ran `npm create vite@latest`, Vite scaffolded
the project with **React 19** (the latest version at the time). But when we
tried to install `@metamask/sdk-react`, npm threw an error:

```
npm error ERESOLVE unable to resolve dependency tree
npm error peer react@"^18.2.0" from @metamask/sdk-react@0.26.5
```

**What this means:** The MetaMask SDK package declares that it requires React
version 18. But our project has React 19. npm's dependency resolver refuses to
install packages with incompatible version requirements.

**The fix and why:** We manually edited `package.json` to pin React 18:
```json
"react": "^18.3.1",
"react-dom": "^18.3.1"
```

This aligns with the dissertation specification (which says React 18) AND
makes MetaMask SDK compatible. The engineering lesson: **always check package
compatibility before starting, especially for SDK integrations.**

### 4.2 The --legacy-peer-deps Flag

**What happened:** Even after pinning React 18, npm still threw a dependency
error — this time because `@metamask/sdk-react` optionally depends on
`react-native`, and `react-native` (a mobile framework) required React 19.

**The engineering explanation:** npm by default enforces **strict peer
dependency resolution** — if package A requires package B version X, and your
project has package B version Y, npm refuses. The `--legacy-peer-deps` flag
tells npm to use the older (npm v6) behaviour: install anyway and let the
developer decide if the conflict matters.

**Why this is safe here:** `react-native` is an **optional** peer dependency.
We are building a web application, not a mobile app. The MetaMask SDK lists
react-native as optional because the SDK can run in either environment. We will
never import react-native code. Passing `--legacy-peer-deps` skips the phantom
conflict without affecting anything in our actual application.

**Engineering lesson:** Not all dependency conflicts represent real problems.
You need to understand WHY the conflict exists before deciding how to handle it.

### 4.3 Why Vite Instead of Create React App (CRA)

| Feature | Vite | Create React App |
|---|---|---|
| Development server startup | <500ms | 10–30 seconds |
| Hot Module Replacement | Near-instant | Seconds |
| Build tool | Rollup (ESM-native) | Webpack |
| Maintenance status | Actively maintained | Effectively abandoned |

Vite uses native ES modules (the modern JavaScript module system) during
development, which means it only processes the file you are currently editing —
not the entire application. This is why it starts so fast.

### 4.4 Why ethers.js v6 Over Web3.js

Both ethers.js and Web3.js do the same job: they allow JavaScript code to
talk to an Ethereum-compatible blockchain. We chose ethers.js v6 because:

1. **Bundle size:** ethers.js is ~120KB; Web3.js is ~590KB. On a slow Cameroonian
   mobile network, smaller is significantly better for the user experience.
2. **TypeScript support:** ethers.js has first-class TypeScript types built in.
   Web3.js types are a separate package maintained by a different team.
3. **ESM modules:** ethers.js v6 is written as a pure ES module. Web3.js still
   ships CommonJS. ESM is the modern standard.
4. **MetaMask compatibility:** ethers.js is the SDK used in MetaMask's own
   documentation.

### 4.5 The Tailwind Loan-State Colour Tokens

In `tailwind.config.js` we defined five custom colours:

```js
'loan-open':      '#3B82F6',  // Blue
'loan-funding':   '#F59E0B',  // Amber
'loan-active':    '#10B981',  // Green
'loan-repaid':    '#6366F1',  // Indigo
'loan-defaulted': '#EF4444',  // Red
```

**Engineering reason:** These colours are tied to the five loan states defined
in the smart contract. By giving them semantic names in Tailwind, every
developer knows that `bg-loan-defaulted` means "this loan is in trouble."
If we just used `bg-red-500` everywhere, the meaning would be lost. This is
called **semantic naming** — using names that describe what something means,
not what it looks like.

---

## PART 5 — BACKEND SETUP (Laravel)

### 5.1 Laravel 13 Instead of Laravel 11

**What happened:** The dissertation specifies Laravel 11, but when we ran
`composer create-project laravel/laravel .`, Composer installed Laravel 13
(the current stable release). This is because we did not specify a version
constraint.

**Why it is not a problem:** Laravel follows **Semantic Versioning** and
maintains strong backwards compatibility. Everything in the dissertation scope
(Sanctum authentication, Eloquent ORM, queue workers, migrations) works
identically in versions 11, 12, and 13. The API we use did not change between
these versions.

**Engineering lesson:** "Latest stable" is almost always the correct choice
for a new project, even if documentation references an older version. Pinning
to an old version locks you out of security patches.

### 5.2 Laravel Sanctum vs Laravel Passport

Both are authentication systems for Laravel. We chose **Sanctum** because:

| | Sanctum | Passport |
|---|---|---|
| Complexity | Simple, SPA-focused | Full OAuth2 server |
| Use case | First-party SPA auth | Third-party API auth |
| Token storage | HTTP-only cookies + Bearer tokens | OAuth2 access/refresh tokens |
| Setup time | Minutes | Hours |

EDL has one frontend (our React SPA) — it is what Sanctum calls a "first-party"
client. We do not need the full OAuth2 flow (with authorisation codes, refresh
tokens, client credentials) that Passport provides. Sanctum's SPA authentication
is simpler, more secure for our use case, and takes minutes to configure.

### 5.3 The Redis Queue Decision

When a loan repayment transaction is confirmed on the blockchain, the event
(`RepaymentMade`) must be:
1. Caught by a Laravel listener
2. Written to the `repayments` MySQL table
3. Update the `credit_scores` table
4. Send a notification to the borrower

If all of this happened synchronously (blocking the API response), the borrower
would wait for all four operations before seeing a response. That could take
seconds. With Redis queues, the API responds instantly ("received") and a
separate **queue worker** process handles the four operations asynchronously.

**Why Redis over the database driver?**
Laravel supports queues backed by either MySQL (database driver) or Redis.
We chose Redis because:
- Redis stores queue jobs in memory — reads/writes are microsecond-speed
- MySQL queue tables grow over time and need maintenance (pruning old jobs)
- Redis is purpose-built for this pattern; MySQL is not

**Engineering concept:** This is the **producer-consumer pattern**. The API
is the producer (it puts jobs on the queue). The `php artisan queue:work`
process is the consumer (it takes jobs off and executes them).

### 5.4 The Sanctum Stateful Domains Configuration

In `config/sanctum.php`, we added `localhost:5173` to the stateful domains:

```
SANCTUM_STATEFUL_DOMAINS=localhost,localhost:5173,127.0.0.1,127.0.0.1:8000
```

**Why:** Sanctum's SPA authentication uses cookies. Cookies only work for
domains the server trusts. Our React dev server runs on port 5173 (Vite's
default). Without this, Sanctum would refuse the React app's authenticated
requests with a 401 Unauthenticated error — even with a valid cookie.

### 5.5 The bootstrap/app.php Change

In Laravel 11+, routing and middleware are configured in `bootstrap/app.php`
instead of the old `app/Http/Kernel.php`. We made two additions:

```php
->withRouting(
    api: __DIR__.'/../routes/api.php',  // ← added
)
->withMiddleware(function (Middleware $middleware): void {
    $middleware->statefulApi();  // ← added
})
```

`statefulApi()` automatically applies Sanctum's session middleware to all
`/api` routes. Without it, the API would not read authentication cookies from
the React app, and every request would be treated as unauthenticated.

### 5.6 The MySQL Database `performance_schema` Error

**What happened:** When we ran `php artisan db:show`, we got:

```
Table 'performance_schema.session_status' doesn't exist
```

**Why this happened:** `db:show` is a Laravel Artisan command that queries
MySQL's `performance_schema` — a special internal database that MySQL uses
for performance monitoring. In this XAMPP installation, `performance_schema`
exists but the specific `session_status` table within it is not populated,
which happens in some older or restricted MySQL builds.

**Why the database connection itself was fine:** The migrations had already
run successfully — `users`, `cache`, `jobs`, and `personal_access_tokens`
tables were all created in `edl_db`. The error was only in the diagnostic
command, not in the actual database operations.

**Fix:** We used `php artisan migrate:status` instead, which queries only
the `migrations` table in our own database — a table we control. This
confirmed the connection was healthy.

---

## PART 6 — SMART CONTRACTS SETUP (Hardhat + Solidity)

### 6.1 Hardhat vs Truffle

Truffle was the original Ethereum development framework (2016–2020). Hardhat
(from Nomic Foundation) replaced it as the industry standard. Key reasons:

1. **console.log() in Solidity:** Hardhat lets you add `console.log()` to
   Solidity contracts during testing — like debugging JavaScript. Truffle cannot.
2. **Hardhat Network:** Built-in local blockchain for testing, faster than
   Ganache for unit tests.
3. **TypeScript support:** First-class, not an afterthought.
4. **Active maintenance:** Truffle was deprecated by Consensys in 2023.

### 6.2 Solidity 0.8.20 — Why This Specific Version

Solidity releases minor versions frequently. We chose 0.8.20 because:

1. **Built-in overflow protection:** Before Solidity 0.8.0, if you added two
   numbers that exceeded their maximum value, they would "overflow" and wrap
   back to zero — a devastating bug in financial code. From 0.8.0 onwards,
   this causes the transaction to revert automatically. No more SafeMath library.

2. **`immutable` keyword:** Variables declared `immutable` are set once in the
   constructor and cannot be changed. We use this for `loanAmount`, `borrower`,
   and `identityRegistry` in LoanContract — values that must never change.

3. **Custom errors:** Instead of `require(condition, "error message string")`,
   Solidity 0.8.4+ supports `error InsufficientFunds(uint256 available)` custom
   errors. These use 4 bytes instead of a full string, saving gas.

4. **Stability:** 0.8.20 is a well-audited, widely-used version. Using the
   absolute latest Solidity version (0.8.2x) risks undiscovered bugs.

### 6.3 OpenZeppelin — Why We Use Library Contracts

OpenZeppelin is a library of audited, battle-tested smart contract components.
Think of it as a security-certified toolbox. We use:

**ReentrancyGuard** — protects the `fund()` and `repay()` functions from
reentrancy attacks. This is how the famous 2016 DAO hack happened: an attacker's
malicious contract called the vulnerable function again (re-entered) before the
first call finished updating the balance. ReentrancyGuard adds a mutex lock
(like a "currently occupied" flag) that prevents this.

**AccessControl** — provides role-based permissions. Rather than writing our
own permission checking logic (and potentially getting it wrong), we use
OpenZeppelin's audited implementation. Roles are stored as `bytes32` keccak256
hashes: `keccak256("ENTREPRENEUR")` rather than plain strings, which saves gas.

**Pausable** — allows the Admin to halt all contract operations in an emergency
(discovered bug, regulatory freeze). This is critical for a financial system.

**Engineering lesson:** Never write your own cryptography or security primitives
unless you are a specialist. Use audited libraries. The cost of a bug in a
financial smart contract is permanent and irreversible — there is no "undo"
on a blockchain.

### 6.4 The `npx hardhat init` Windows Terminal Problem

**What happened:** When we tried `npx hardhat init`, it failed with:

```
Error HH15: You are not inside a project and Hardhat failed to initialize.
If you were trying to create a new project, please try again using WSL or PowerShell.
```

**Why this happened:** `npx hardhat init` is an **interactive CLI** — it
displays menus and waits for you to press Enter. When a process like this is
run from an automated script (where there is no human sitting at a terminal),
it cannot display the menu and fails. This is called a **TTY (teletype) error**
— the process expected a real terminal, not a pipe.

**Fix:** We skipped `npx hardhat init` entirely and manually created:
- `hardhat.config.js` (the only required file Hardhat needs)
- `src/` directory (source path)
- `test/` directory (test path)
- `scripts/` directory (deployment scripts)

This is actually **better** than using the init wizard, because the wizard
creates sample contracts (`Lock.sol`) that we would immediately delete anyway.
We created exactly what we needed, nothing more.

### 6.5 The Source Path: `src/` Not `contracts/`

In `hardhat.config.js`, we set:
```js
paths: {
  sources: "./src",  // ← not the default "./contracts"
}
```

**Why:** The `requirements.json` file specifies contract paths as:
```json
"file": "contracts/src/IdentityRegistry.sol"
```

The repo structure is `contracts/` (the Hardhat workspace) → `src/` (Solidity
files). If we used Hardhat's default `./contracts` path, every file reference in
the documentation would be wrong and confusing. We configured Hardhat to match
the documented architecture, not the other way around.

**Engineering principle:** Documentation and code must agree. When they
disagree, one of them is wrong. Fix the code to match the architecture
decision, not the architecture to match the code default.

---

## PART 7 — GANACHE SETUP AND THE TWO TECHNICAL PROBLEMS

### 7.1 What Ganache Is and Why We Use It

Ganache is a **simulated Ethereum blockchain** that runs entirely on your
laptop. It is not connected to any real network. Think of it like a flight
simulator — it behaves exactly like a real blockchain but:

- Every transaction confirms in 1 second (real Ethereum takes 12+ seconds)
- No gas costs (every account starts with 1000 fake ETH)
- You can reset it instantly to start fresh
- No real money involved at any point

We use Ganache for development. When the dissertation is complete, the same
contracts deploy to Hyperledger Besu (the production network).

### 7.2 Problem #1: `--deterministic` and `--mnemonic` Are Mutually Exclusive

**What happened:** The original setup command was:
```bash
ganache --deterministic --mnemonic "test test test test test test test test test test test junk" ...
```

Ganache responded:
```
Values for both "wallet.mnemonic" and "wallet.deterministic" cannot be
specified; they are mutually exclusive.
```

**Why this happened:** A **mnemonic** is a 12-word phrase used to generate
wallet addresses (like a master password for a set of keys). Ganache's
`--deterministic` flag is a shortcut that means "use our built-in standard
mnemonic." If you also provide your own mnemonic with `--mnemonic`, Ganache
does not know which one to use — two sources of truth for the same thing.
Ganache v7 made this an error rather than silently picking one.

**Fix:** Use either `--deterministic` (to get Ganache's standard accounts) OR
`--mnemonic "..."` (to specify your own). We chose `--mnemonic "test test test..."`.

### 7.3 Problem #2: The Private Key Mismatch (The HD Derivation Path Difference)

This is the most interesting technical problem we encountered. Understanding it
teaches you something fundamental about how blockchain accounts work.

**What happened:** After restarting Ganache with the standard mnemonic, the
deploy script failed:

```
Deploying from: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Balance: 0.0 ETH
ProviderError: insufficient funds for gas * price + value
```

The deployer had ZERO ETH. But we could see in Ganache that the accounts had
1000 ETH each.

**The root cause — HD Wallets and Derivation Paths:**

Both Ganache and Hardhat use BIP-39 mnemonics (the 12-word phrases). But they
derive the actual accounts from that mnemonic using different **derivation paths**.

A derivation path is a formula like `m/44'/60'/0'/0/0`. Think of the mnemonic
as a master key, and the derivation path as instructions for which room to open
with that key.

| Framework | Derivation Path | Account 0 (from "test test...junk") |
|---|---|---|
| Hardhat | `m/44'/60'/0'/{index}` | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Ganache / MetaMask | `m/44'/60'/0'/0/{index}` | `0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1` |

The paths differ by one level of depth (`/0/{index}` vs `/{index}`). The same
mnemonic + different path = different account. That is why Ganache's account 0
and Hardhat's account 0 are different addresses, even though they use the same
12-word phrase.

**Hardhat's config used its own address**, which Ganache did not fund.
Ganache funded `0x90F8bf6...` — not `0xf39Fd6...`.

**The fix:** We updated `hardhat.config.js` to use Ganache account 0's private
key directly:

```js
// Ganache account [0] — address: 0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1
const PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY ||
  "0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d";
```

After this fix, the deployment succeeded:
```
Deploying from: 0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1
Balance: 1000.0 ETH
EDLPlaceholder deployed to: 0xe78A0F7E598Cc8b0Bb87894B0F60dD2a88d6a8Ab
Contract name: EDL Microfinance
```

**The deeper lesson:** Private keys and addresses are mathematically linked.
The private key is a 256-bit random number. The public key is derived from it
using **elliptic curve cryptography** (specifically the secp256k1 curve — the
same curve Bitcoin uses). The address is the last 20 bytes of the Keccak-256
hash of that public key. There is no practical way to reverse any of these
steps — you cannot go from address back to private key. This is what makes
public-key cryptography the foundation of blockchain security.

---

## PART 8 — THE GIT COMMIT HISTORY AS ENGINEERING RECORD

Professional software development uses **conventional commits** — a standard
format for commit messages that makes the history readable:

```
type: subject

type can be:
  feat     — new feature
  fix      — bug fix
  docs     — documentation only
  chore    — infrastructure/tooling change
  refactor — code restructure, no new features
```

Our commit history:
```
556b929 chore: initialize EDL monorepo
fe28efa docs: add project README with system overview
04b5724 docs: add complete SRS with 18 FR and 10 NFR
e17e71c docs: add machine-readable requirements index
950705e docs: add complete actor definitions with role mapping
9c24e55 docs: add use case specifications for all 10 use cases
243a9cf docs: add user stories for all actor roles
33ada59 docs: add technology stack decision record
9b8fda6 feat: scaffold frontend and backend project foundations
56e942e feat: complete development environment setup — all 5 tiers operational
```

**Notice:** seven documentation commits before the first `feat` commit. This
reflects the documentation-first approach and creates a permanent, auditable
record of the engineering decisions.

---

## PART 9 — WHERE WE ARE NOW (Current State)

### What Is Running

| Component | Status | Location |
|---|---|---|
| Ganache blockchain | Running (background) | http://127.0.0.1:8545 |
| React dev server | Ready to start | http://localhost:5173 |
| Laravel API | Ready to start | http://localhost:8000 |
| MySQL database | Running (XAMPP) | edl_db — 4 tables migrated |
| Smart contracts | Compiled, placeholder deployed | contracts/src/ |

### What Is Confirmed Working

1. **Hardhat → Ganache:** `EDLPlaceholder.sol` deployed and verified
2. **Laravel → MySQL:** All 4 default migrations ran successfully
3. **React → Vite:** Dev server starts in 2.2 seconds, no errors
4. **Ganache RPC:** Responds to JSON-RPC calls (`eth_blockNumber` = 0x0)
5. **Test suite:** 1 Solidity test passing (deploy + name verification)

### What Comes Next

The development environment is complete. The next phase is building the actual
smart contracts:

1. **`IdentityRegistry.sol`** — KYC hashing, role assignment, CEMAC blacklist
2. **`LoanFactory.sol`** — consortium-wide loan registry
3. **`LoanContract.sol`** — the full loan state machine (OPEN→REPAID/DEFAULTED)

Then the Laravel API controllers and migrations for all 16 database tables,
then the React components and dashboards.

---

## APPENDIX A — KEY VOCABULARY

| Term | Plain-language meaning |
|---|---|
| Smart contract | A program that lives on the blockchain and runs automatically when called |
| Gas | The fee paid for executing code on a public Ethereum network |
| Mnemonic | A 12-word phrase that generates a set of wallet accounts |
| Private key | A secret number that proves you own a wallet address |
| Public key | Derived from private key; safe to share |
| Address | The last 20 bytes of a hash of your public key; like a bank account number |
| Hash (SHA-256) | A mathematical fingerprint of data; same input always gives same output |
| ABI | Application Binary Interface — how code outside the blockchain calls a contract |
| EVM | Ethereum Virtual Machine — the runtime that executes smart contract code |
| PoA | Proof-of-Authority — consensus mechanism where known validators sign blocks |
| Peer dependency | A package that your package requires the consuming project to also have |
| TTY | TeleTYpe — a real interactive terminal (as opposed to a script/pipe) |
| HD wallet | Hierarchical Deterministic wallet — generates many accounts from one mnemonic |
| Derivation path | The formula used to generate a specific account from a mnemonic |
| Reentrancy | A security attack where a malicious contract calls back into a vulnerable function |
| Mutex | Mutual exclusion lock — prevents two operations from running at the same time |
| Sanctum | Laravel's lightweight authentication for SPAs using cookies + Bearer tokens |
| Queue worker | A background process that handles jobs asynchronously |
| ESM | ECMAScript Modules — the modern JavaScript module system (import/export) |
| CJS | CommonJS — the older Node.js module system (require/module.exports) |

---

## APPENDIX B — QUICK REFERENCE: START THE DEV ENVIRONMENT

```bash
# Terminal 1 — Ganache (blockchain)
ganache --mnemonic "test test test test test test test test test test test junk" \
  --port 8545 --accounts 10 --chain.chainId 1337 --chain.networkId 1337

# Terminal 2 — Laravel API
cd backend && php artisan serve

# Terminal 3 — Queue worker (blockchain event listener)
cd backend && php artisan queue:work

# Terminal 4 — React frontend
cd frontend && npm run dev

# Terminal 5 — Deploy contracts (after Ganache is running)
cd contracts && npx hardhat run scripts/deploy-placeholder.js --network ganache
```

---

*End of Engineering Journal — Phase 1: Development Environment Setup*
*Next journal entry will cover: Smart Contract Implementation*
