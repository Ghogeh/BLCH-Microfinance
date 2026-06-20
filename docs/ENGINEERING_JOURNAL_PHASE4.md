# EDL Project — Engineering Journal: Phase 4
## Production Structure, Configuration Files & Full-Stack Smoke Testing

**Phase:** 4 — Development Environment Hardening
**Author:** Carl Ghogeh Vezhugho (UBA25EP054)
**Journal written by:** AI Pair Programmer (Claude Sonnet 4.6)
**Audience:** Yourself, future collaborators, dissertation examiners
**Date:** June 2026
**Prerequisite reading:** ENGINEERING_JOURNAL.md (Phase 1–3)

---

> This document picks up where the first journal ended. At that point we had
> a working development environment — Ganache running, Laravel migrated, React
> compiling, Hardhat deploying. Phase 4 is about turning that rough scaffold
> into a professionally structured project. Every folder, every config file,
> every routing decision is explained from first principles.

---

## PART 1 — WHY "PRODUCTION-READY STRUCTURE" MATTERS BEFORE WRITING CODE

### 1.1 The Problem With Growing Without a Plan

Imagine building a house by starting with one room, then adding another room
wherever it fits, then a third wherever there is space. After ten rooms the
house is a maze — no logical flow, no consistent layout, no way for a newcomer
to know where anything is.

Software projects grow the same way if you do not plan the folder structure
first. You end up with:

- Controllers mixed with models mixed with utilities
- Test files scattered across the project
- Config files duplicated in multiple places
- New team members (or your future self after six months) spending hours
  finding where a specific piece of code lives

**Professional engineering practice** is to define the complete folder
structure before writing a single feature — even if most folders start empty.
This is called **scaffolding**: building the skeleton before the flesh.

### 1.2 The Monorepo Structure

Our project is a **monorepo** — a single Git repository containing multiple
independent applications (frontend, backend, contracts). Each application
has its own dependency manager (`npm` for frontend/contracts, `composer` for
backend) but they share one Git history, one README, and one set of
documentation.

**Why a monorepo over separate repositories?**

| Concern | Monorepo | Separate Repos |
|---|---|---|
| Finding related code | One place | Multiple repos to navigate |
| Atomic commits | One commit can touch frontend + backend | Requires synchronising multiple commits |
| ABI sharing (contracts → frontend) | Script copies files within same repo | Requires publishing packages or manual copying |
| Dissertation scope | Natural for a single-author project | Overhead with no benefit |
| CI/CD in production | Slightly more complex | Simpler per-service pipelines |

For a dissertation project by a single author, the monorepo is clearly the
right choice. The slight production complexity is irrelevant at this scope.

---

## PART 2 — THE FOLDER STRUCTURE DECISIONS (IN DETAIL)

### 2.1 Frontend Structure

```
frontend/src/
├── components/    ← reusable UI building blocks
│   ├── auth/      ← login, register, wallet connect
│   ├── loan/      ← loan cards, forms, state badges
│   ├── dashboard/ ← credit gauge, overview cards
│   ├── credit/    ← credit passport, history table
│   ├── audit/     ← regulator portal, Merkle verifier
│   └── shared/    ← buttons, modals, inputs (used everywhere)
├── pages/         ← full page compositions
│   ├── Auth/      ← login/register pages
│   ├── Dashboard/ ← borrower dashboard page
│   ├── Loan/      ← loan request page
│   ├── Lender/    ← lender dashboard page
│   ├── Officer/   ← KYC officer panel page
│   ├── Audit/     ← regulator audit portal page
│   └── Admin/     ← admin console page
├── hooks/         ← custom React hooks
├── contexts/      ← React context providers
├── utils/         ← pure helper functions
├── abi/           ← smart contract ABIs (JSON)
├── test/          ← test setup and helpers
└── assets/        ← images, icons
```

**The components vs pages distinction:**

This is one of the most important architectural patterns in React development.

A **component** is a reusable, self-contained piece of UI. It does not know
which page it is on. A `LoanCard` component just shows one loan — it does not
care whether it appears on the borrower dashboard or the lender dashboard.

A **page** is a full-screen view composed of multiple components. The
`BorrowerDashboard` page arranges `LoanCard`, `CreditScoreGauge`, and
`NotificationList` components into a complete layout.

**Why organize components by feature domain?**

An alternative is to organize by component type: `buttons/`, `forms/`,
`tables/`. We rejected this because:

1. When you are working on the "loan funding" feature, you need to touch
   `LoanCard.jsx`, `FundButton.jsx`, and `FundingProgress.jsx` — all in
   the same folder, not scattered across `cards/`, `buttons/`, `progress/`.
2. Feature-based organization maps directly to the six actors in our system
   — each actor has their own feature domain.

**The `shared/` subfolder** contains truly generic components that have
no domain knowledge: a `Button.jsx` that just renders a styled button,
a `Modal.jsx` that just shows a popup. These genuinely belong together
because they are used across all feature domains.

### 2.2 The `abi/` Folder — A Critical Bridge

This folder deserves special explanation because it represents the connection
point between the blockchain tier and the frontend tier.

When Hardhat compiles a Solidity contract, it produces an **ABI (Application
Binary Interface)** — a JSON file that describes every function, event, and
variable in the contract. Think of it like a menu at a restaurant: it tells
you what you can order (call) and what format to use.

The React frontend needs this ABI to interact with the contracts using
ethers.js. Without it, ethers.js does not know what functions exist or what
parameters they expect.

**The `extract-abis.js` script** (File 6 in our configuration files)
automates this bridge:

```
contracts/artifacts/src/LoanFactory.sol/LoanFactory.json
         ↓ extract-abis.js
frontend/src/abi/LoanFactory.json
```

Every time you recompile the contracts and deploy, you run this script to
keep the frontend's ABIs in sync. This is a common pattern in Ethereum
development called **artifact synchronisation**.

### 2.3 Backend Structure

```
backend/app/
├── Http/
│   ├── Controllers/
│   │   ├── Auth/     ← AuthController (register, login, logout, me)
│   │   ├── KYC/      ← KYCController (upload, verify, reject, queue)
│   │   ├── Loan/     ← LoanController (CRUD + lifecycle actions)
│   │   ├── Credit/   ← CreditController (score, passport)
│   │   └── Audit/    ← AuditController (regulator views)
│   ├── Middleware/   ← custom middleware (role checks go here)
│   └── Resources/    ← API response transformers
├── Models/           ← Eloquent database models
├── Services/         ← business logic classes
├── Jobs/             ← queue-based background tasks
├── Events/           ← domain events (LoanCreated, RepaymentMade)
└── Listeners/        ← event handlers (send notification, update DB)
```

**Why controllers are in subdirectories:**

Laravel allows controllers to live in `app/Http/Controllers/` flat, or
in subdirectories with namespaces. We chose subdirectories because:

1. With 5 controllers × 5–10 methods each, a flat folder becomes 50+ methods
   to scroll through
2. Subdirectories map directly to the API route groups (`/auth/*`, `/loans/*`,
   `/kyc/*`, `/audit/*`, `/credit/*`)
3. Each subdirectory can later have its own request validation classes,
   keeping related code physically co-located

**The Services layer — why it exists:**

A common beginner mistake is to write all business logic directly in
controllers. This creates what developers call **fat controllers** — single
files with hundreds of lines doing database queries, blockchain calls,
file operations, and API responses all mixed together.

The **Service pattern** extracts business logic into dedicated classes:

```
Controller: "I received a KYC upload request"
    ↓ delegates to
KYCService: "I will hash the file, store it, and call the blockchain"
    ↓ delegates to
BlockchainService: "I will send the registerIdentity() transaction"
```

Each class has one clear job. When a bug occurs, you know exactly which
class to look in.

**Events and Listeners — the reactive pattern:**

Laravel's event system implements the **Observer pattern**. When a loan
is repaid on-chain, several things need to happen:

1. Insert a row in the `repayments` table
2. Update the `credit_scores` table
3. Send a notification to the borrower
4. Update the `loans` table status

If you wrote all four in the controller, it becomes a giant function.
Instead:

- A `RepaymentMade` **Event** is fired (just a signal: "this happened")
- Four separate **Listeners** each handle one responsibility
- They run asynchronously through the queue worker

This is called **Separation of Concerns** at the event level.

### 2.4 The `storage/app/kyc_documents/` Directory

KYC documents (national ID photos, passport scans) are uploaded by borrowers.
They must:
1. Never be publicly accessible (security/privacy)
2. Be stored separately from code
3. Be outside the `public/` folder (anything in `public/` is web-accessible)

Laravel's `storage/app/` directory is outside the web root — files there
cannot be accessed by a URL unless you explicitly create a symlink. This
is the correct location for private uploaded files.

### 2.5 The Contracts Structure

```
contracts/
├── src/            ← Solidity source files (matches requirements.json)
│   └── access/     ← role and access control contracts
├── test/           ← Hardhat test files
├── scripts/        ← deployment and utility scripts
└── deployments/    ← JSON records of deployed addresses per network
```

**Why `src/` instead of Hardhat's default `contracts/`:**

Hardhat's default source path is `./contracts`, but our monorepo already
has a top-level `contracts/` directory (the Hardhat workspace). If we used
the default, Solidity files would live at `contracts/contracts/LoanFactory.sol`
— a confusing double-nested path.

We configured `paths.sources = "./src"` in `hardhat.config.js`, giving
us the clean path `contracts/src/LoanFactory.sol` — which exactly matches
the `"file"` paths in `requirements.json`.

**The `deployments/` folder — why deployment records matter:**

Every time you deploy contracts, the addresses change (unless you use
deterministic deployment). If you forget to record the address, you cannot
call the contract from the frontend or backend.

The `deployments/` folder holds JSON records like:
```json
{
  "network": "ganache",
  "chainId": 1337,
  "deployedAt": "2026-06-20T02:28:32Z",
  "IdentityRegistry": "0xe78A0F7E...",
  "LoanFactory": "0x5b1869D9...",
  "deployer": "0x90F8bf6A..."
}
```

These records serve as the source of truth for the `.env` files in both
the `backend/` and `frontend/` directories.

### 2.6 The `.gitkeep` Convention

Git does not track empty directories. If you create `frontend/src/hooks/`
but put no files in it, `git add` silently ignores it and it disappears
from the repository for anyone who clones it.

The solution is to add a hidden placeholder file: `.gitkeep`. This is not
a Git feature — it is a convention the community adopted. The file is empty,
its only purpose is to give Git something to track in the directory.

When you later add real files to the directory, you can delete `.gitkeep`
— or leave it, it does not matter.

---

## PART 3 — THE CONFIGURATION FILES (IN DETAIL)

### 3.1 `vite.config.js` — The Complete Build Configuration

#### 3.1.1 Path Aliases

```js
resolve: {
  alias: {
    '@':           path.resolve(__dirname, './src'),
    '@components': path.resolve(__dirname, './src/components'),
    '@hooks':      path.resolve(__dirname, './src/hooks'),
    // ...
  }
}
```

**What this solves:** Without aliases, imports in deeply nested files look like:
```js
import LoanCard from '../../../components/loan/LoanCard'
```

With aliases:
```js
import LoanCard from '@components/loan/LoanCard'
```

The alias is always relative to `src/`, regardless of how deep the importing
file is. This prevents the "import path archaeology" problem where moving a
file breaks all its relative imports.

**How it works technically:** Vite intercepts every `import` statement. When
it sees `@components/loan/LoanCard`, it rewrites the path to the absolute
filesystem path before the JavaScript bundler processes it. This happens at
build time, producing zero runtime overhead.

#### 3.1.2 The Vite Dev Server Proxy

```js
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8000',
      changeOrigin: true,
      secure: false,
    }
  }
}
```

**The problem this solves — CORS:**

CORS (Cross-Origin Resource Sharing) is a browser security mechanism. When
JavaScript on `http://localhost:5173` tries to fetch from `http://localhost:8000`,
the browser blocks the request because the **origin** (domain + port) is
different. This is called a **cross-origin request**.

The proxy is the elegant solution: the React app never actually calls
`localhost:8000` directly. Instead:

1. React calls `http://localhost:5173/api/loans` (same origin — no CORS)
2. Vite's dev server receives the request
3. Vite forwards it to `http://localhost:8000/api/loans` (server-to-server, no CORS)
4. Laravel responds to Vite
5. Vite returns the response to React

The browser never makes a cross-origin request. CORS is completely bypassed
during development.

**In production,** Nginx (or another reverse proxy) handles this same
routing — same pattern, different tool.

#### 3.1.3 Build Code Splitting

```js
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'ethers':   ['ethers'],
        'recharts': ['recharts'],
        'vendor':   ['react', 'react-dom', 'react-router-dom'],
      }
    }
  }
}
```

**What is code splitting and why does it matter for EDL?**

When Vite builds the production app, it bundles all JavaScript into files.
Without code splitting, everything goes into one massive file. The user must
download ALL of it before the app starts — including `ethers.js` (a large
library) even if they are just on the login page.

With manual chunks, we split the bundle into separate files:
- `vendor.js` — React, ReactDOM, React Router (changes rarely)
- `ethers.js` — ethers.js library (changes rarely)
- `recharts.js` — charting library (changes rarely)
- `main.js` — our application code (changes often)

**The caching benefit:** Browsers cache files by URL. When you deploy a new
version of EDL, only `main.js` changes — `vendor.js`, `ethers.js`, and
`recharts.js` are already cached in the user's browser. They download only
the small changed file, not the entire application. On a slow Cameroonian
mobile network, this difference is significant.

#### 3.1.4 The Vitest Test Configuration (Inside vite.config.js)

```js
test: {
  globals:     true,
  environment: 'jsdom',
  setupFiles:  './src/test/setup.js',
}
```

Unusually, Vitest reads its configuration from the same file as Vite. This
is intentional — Vitest is designed to share Vite's build pipeline, so test
files get the same path aliases, plugins, and transforms as production code.

`environment: 'jsdom'` tells Vitest to simulate a browser environment during
tests. Node.js has no `window`, `document`, or `localStorage`. jsdom is a
JavaScript implementation of these browser APIs, allowing tests to render
React components as if they were in a browser.

### 3.2 `.eslintrc.cjs` — Code Quality Enforcement

ESLint is a **static analysis tool** — it reads your code without running it
and reports problems. Think of it as a strict colleague who reviews every line
of code you write and flags issues before you even save the file.

```js
extends: [
  'eslint:recommended',        // basic JS rules (no undefined variables, etc.)
  'plugin:react/recommended',  // React-specific rules
  'plugin:react/jsx-runtime',  // allows JSX without importing React (React 17+)
  'plugin:react-hooks/recommended', // enforces hooks rules (no conditional hooks)
  'prettier',                  // disables ESLint rules that conflict with Prettier
]
```

**Why `react-hooks/recommended` is critical:**

React hooks have two rules that, if violated, cause subtle bugs that are
extremely difficult to debug:

1. **Only call hooks at the top level** — never inside loops, conditions,
   or nested functions. React tracks hooks by their order of declaration;
   if that order changes between renders, state gets assigned to the wrong hook.

2. **Only call hooks from React functions** — never from plain JavaScript
   functions.

The `react-hooks/recommended` plugin automatically enforces these rules.
Violating them without this plugin gives you a bug that looks completely
unrelated to the actual cause.

**The `prettier` extension at the end:**

ESLint and Prettier can conflict. Prettier might want no semicolons; ESLint
might require them. Adding `'prettier'` last disables all ESLint formatting
rules, letting Prettier own all style decisions. ESLint only catches logical
and correctness issues; Prettier handles formatting.

**Why `.eslintrc.cjs` not `.eslintrc.js`:**

Our `frontend/package.json` has `"type": "module"`, which means all `.js`
files are treated as ES modules (they must use `import`/`export`). But ESLint
config files use `module.exports = {}` syntax — CommonJS. The `.cjs` extension
explicitly marks this file as CommonJS, bypassing the module type declaration.

### 3.3 `.prettierrc` — Code Formatting Standards

```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

**Why no semicolons (`"semi": false`)?**

This is a team/style choice. Modern JavaScript has **Automatic Semicolon
Insertion (ASI)** — the parser adds semicolons where they are unambiguous.
The one case where ASI fails (lines starting with `(`, `[`, or `` ` ``) is
handled by Prettier itself. Without semicolons, code is visually cleaner and
diffs are smaller (no semicolon-only changes).

**Why `"trailingComma": "es5"`?**

Trailing commas after the last item in arrays and objects:
```js
const config = {
  key1: 'value1',
  key2: 'value2',   // ← trailing comma
}
```

This is valid in ES5+ and has a concrete benefit: when you add a new property,
the Git diff only shows one line changed (the new property), not two lines
(the previous last property losing its comma, plus the new property). Cleaner
history.

**`prettier-plugin-tailwindcss`:**

This plugin automatically sorts Tailwind class names into a consistent order.
Without it, one developer might write `"flex bg-white p-4 text-sm rounded"` and
another might write `"rounded text-sm bg-white p-4 flex"`. Git would show these
as different even though they produce identical styling. The plugin enforces a
canonical order, eliminating this class of diff noise.

### 3.4 `src/test/setup.js` — The Test Environment Contract

#### 3.4.1 The MetaMask Mock

```js
global.window.ethereum = {
  isMetaMask: true,
  request: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  selectedAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  chainId: '0x539',
}
```

**Why this is necessary:**

MetaMask injects a `window.ethereum` object into real browsers. Tests run
in jsdom (a simulated browser) with no MetaMask extension. Any component
that calls `window.ethereum.request()` would crash with `Cannot read
properties of undefined`.

By setting `global.window.ethereum` in the test setup, every test file
automatically has a MetaMask-like object available. `vi.fn()` creates a
**spy function** — a fake function that records every call made to it,
letting you later assert `expect(window.ethereum.request).toHaveBeenCalledWith(...)`.

The `chainId: '0x539'` is `1337` in hexadecimal — our Ganache chain ID
expressed the way MetaMask expects it (hex string with `0x` prefix).

#### 3.4.2 The ethers.js Mock

```js
vi.mock('ethers', async () => {
  const actual = await vi.importActual('ethers')
  return {
    ...actual,
    BrowserProvider: vi.fn().mockImplementation(() => ({
      getSigner: vi.fn().mockResolvedValue({
        getAddress: vi.fn().mockResolvedValue(
          '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
        ),
      }),
    })),
  }
})
```

**The engineering decision behind partial mocking:**

`vi.mock('ethers', ...)` replaces the entire `ethers` library for tests.
But we want most of `ethers` to work normally — we only need to mock
`BrowserProvider` (which normally requires a real browser with MetaMask).

The pattern `const actual = await vi.importActual('ethers')` imports the
real library, then `{ ...actual, BrowserProvider: vi.fn()... }` spreads
all real exports and overrides only `BrowserProvider`. This is called
**partial mocking**.

`vi.fn().mockImplementation(() => ...)` creates a fake constructor. When
test code does `new BrowserProvider(window.ethereum)`, it gets back a fake
object with a fake `getSigner()` method — instead of actually connecting
to MetaMask.

`mockResolvedValue` is used because `getSigner()` is async (returns a Promise).
The mock returns a Promise that resolves to the fake signer object.

### 3.5 `backend/routes/api.php` — The Complete API Route Map

```php
// Public routes (no authentication required)
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login',    [AuthController::class, 'login']);

// Authenticated routes (Sanctum token required)
Route::middleware('auth:sanctum')->group(function () {
    // ... all protected routes
});
```

**Why `auth:sanctum` and not just `auth`?**

Laravel has multiple authentication guards. The default `auth` guard uses
session-based authentication (designed for server-rendered web apps). The
`auth:sanctum` guard accepts both cookies (for SPA sessions) and Bearer
tokens (for mobile/API clients). Since EDL's React frontend uses cookies
via Sanctum's SPA authentication, we need `auth:sanctum`.

**The nested `auth:sanctum` group for regulators:**

```php
Route::middleware('auth:sanctum')->group(function () {
    // ... general authenticated routes

    // Regulator-only (nested group — same middleware, future will add role check)
    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/audit/loans', ...);
    });
});
```

At this stage, the nested group uses the same middleware. In Phase 5, this
will become `middleware(['auth:sanctum', 'role:regulator'])` — adding role
enforcement. We nested the group now so the structure is correct for when
the role middleware is added, without having to restructure routes later.

**The 25 registered routes:**

Every route maps exactly to an entry in `requirements.json`'s `apiEndpoints`
array. This is intentional — the JSON file is the specification, the PHP file
is the implementation. If they do not match, there is a bug in the spec or
the implementation.

### 3.6 `contracts/scripts/extract-abis.js` — The ABI Bridge Script

```js
import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const contracts = ['IdentityRegistry', 'LoanFactory', 'LoanContract']

for (const name of contracts) {
  const artifact = JSON.parse(fs.readFileSync(src, 'utf8'))
  fs.writeFileSync(dst, JSON.stringify(artifact.abi, null, 2))
}
```

**Why `fileURLToPath`?**

This script uses ES Module syntax (`import` instead of `require`). In
CommonJS, you have `__dirname` (the current directory path) automatically.
In ES Modules, `__dirname` does not exist. `fileURLToPath(import.meta.url)`
is the ES Module equivalent — it converts the current file's URL
(`file:///C:/project/contracts/scripts/extract-abis.js`) to a file path.

**Why only the `abi` field, not the full artifact?**

Hardhat artifacts contain:
- `abi` — the interface definition (what we need)
- `bytecode` — the compiled contract machine code (what Hardhat uses to deploy)
- `deployedBytecode` — the code as deployed (not needed in frontend)
- `linkReferences` — for library linking (not applicable here)

The frontend only needs the ABI to call deployed contracts. Shipping the
full artifact would send unnecessary data to every user's browser.

---

## PART 4 — THE STUB CONTROLLERS DECISION

### 4.1 What Happened and Why

When we ran `php artisan route:list` after writing `api.php`, it failed:

```
ReflectionException: Class "App\Http\Controllers\Auth\AuthController" does not exist
```

**What PHP Reflection is:**

PHP has a built-in introspection system called **Reflection** — the ability
for code to examine other code at runtime. `php artisan route:list` uses
Reflection to find the source file of each controller class so it can show
you the file name and line number.

When a controller class does not exist, Reflection throws an exception
instead of just printing a warning.

### 4.2 The Fix — Stub Controllers

We created minimal controller files with empty method bodies:

```php
<?php
namespace App\Http\Controllers\Auth;
use App\Http\Controllers\Controller;

class AuthController extends Controller
{
    public function register() {}
    public function login() {}
    public function logout() {}
    public function me() {}
}
```

**Why this is the right approach (not just skipping the route:list test):**

1. The route:list command is a critical diagnostic tool — we will use it
   constantly to verify routes are registered correctly
2. Stub controllers are a legitimate **Test-Driven Development** technique:
   define the interface before the implementation
3. Empty method bodies are valid PHP — they compile and route to correctly.
   A request to `POST /api/register` will reach `AuthController::register()`
   and return an empty 200 response. That is actually useful for testing
   the routing layer independently from the business logic layer.
4. When we implement the real controllers in Phase 5, we are filling in
   method bodies — not restructuring anything. The architecture is already
   correct.

**The namespace convention:**

```php
namespace App\Http\Controllers\Auth;
```

This matches Laravel's PSR-4 autoloading configuration in `composer.json`:
```json
"autoload": {
    "psr-4": {
        "App\\": "app/"
    }
}
```

PSR-4 maps the namespace `App\Http\Controllers\Auth` to the filesystem path
`app/Http/Controllers/Auth/`. Laravel discovers the class automatically —
no manual registration required.

---

## PART 5 — THE SMOKE TESTS (IN DETAIL)

### 5.1 What a Smoke Test Is

A **smoke test** comes from electronics engineering. When you build a new
circuit, before running complex tests, you power it on and watch for smoke.
If it smokes, something is fundamentally wrong — no point running further tests.

In software, a smoke test is a minimal check that the system is alive and
the basic connections work. We do not test features — we test that each tier
can talk to the next.

### 5.2 Test 1 — Git Status

```
Expected: "nothing to commit, working tree clean"
Result:   "nothing to commit, working tree clean" ✅
```

**Why this test first:**

Before any functional testing, verify the codebase is in a known state.
If there are uncommitted changes, any problems found during testing could
be caused by those changes. A clean working tree means the test results
reflect the committed code, not a half-finished edit.

**The `ahead of origin` note:**

The output also showed `Your branch is ahead of 'origin/master' by 5 commits`.
This means there is a remote repository (GitHub/GitLab) and we have not
pushed recent commits. This is not an error — it is expected in a development
workflow where you batch pushes.

### 5.3 Test 2 — Ganache Network Version

```
curl --data '{"jsonrpc":"2.0","method":"net_version","params":[],"id":1}'
Result: {"result":"1337"} ✅
```

**What `net_version` returns:**

`net_version` is an Ethereum JSON-RPC method that returns the **network ID**
(also called chain ID) as a string. We configured Ganache with
`--chain.networkId 1337`, so we expect `"1337"`.

**Why `net_version` not `eth_blockNumber`?**

`eth_blockNumber` tells us the node is running. `net_version` tells us it
is the CORRECT node (our Ganache, not some other service on port 8545).
Always verify identity, not just liveness.

**What JSON-RPC is:**

JSON-RPC is a protocol for calling functions over HTTP using JSON. The
payload specifies:
- `jsonrpc: "2.0"` — protocol version
- `method` — the function to call
- `params` — arguments
- `id` — request ID (so you can match responses to requests)

All Ethereum clients (Ganache, Besu, MetaMask) speak JSON-RPC. This is
the standard interface for the blockchain tier.

### 5.4 Test 3 — Hardhat Deploy to Ganache

```
Deploying from: 0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1
Balance: 999.999811167958984375 ETH
EDLPlaceholder deployed to: 0x5b1869D9A4C187F2EAa108f3062412ecf0526b24
Contract name: EDL Microfinance ✅
```

**The balance: 999.999... not 1000 exactly:**

Notice the balance is slightly less than 1000 ETH. The difference
(`0.000188832...`) is the gas cost of the previous deployment during Test 6
in the environment setup. This proves:
1. Ganache's state persisted across the deployment sessions
2. Gas is being correctly consumed and tracked
3. The same account is being used across sessions (confirming our private key
   is correctly configured)

**Why the contract address is different from the first deployment:**

`0x5b1869D9A4...` vs `0xe78A0F7E5...` (from the first smoke test).

Contract addresses on Ethereum are derived from the deployer's address and
their **nonce** (a counter of transactions sent). After the first deployment,
the nonce incremented from 0 to 1. So this deployment, using nonce 1, produces
a different address. This is deterministic — the same deployer + nonce always
produces the same address.

### 5.5 Test 4 — Laravel API Authentication Response

**The bug we found and fixed:**

The first attempt returned a full stack trace:
```json
{
  "message": "Route [login] not defined.",
  "exception": "RouteNotFoundException"
}
```

**Root cause analysis:**

When Sanctum's `auth:sanctum` middleware detects an unauthenticated request,
it calls the `Authenticate` middleware's `redirectTo()` method to determine
where to redirect the user. The default implementation tries:

```php
return route('login'); // generates URL for the named route 'login'
```

In a traditional Laravel web application, there is always a `Route::get('/login',
...)->name('login')` in `routes/web.php`. But EDL is an **API-only backend**
— `routes/web.php` has no login route. The `route('login')` call throws
`RouteNotFoundException`.

The exception is caught by the exception handler, but the stack trace reveals
it was thrown by the redirect logic, not rendered as a clean JSON 401.

**The fix in `bootstrap/app.php`:**

```php
$middleware->redirectGuestsTo(
    fn (Request $request) => $request->is('api/*') ? null : route('login')
);
```

`redirectGuestsTo()` overrides the default redirect behaviour. When the
request path starts with `api/`, we return `null`. When `redirectTo()` returns
`null`, the `Authenticate` middleware does not redirect — instead it throws
an `AuthenticationException`. The exception handler then catches it and, because
`shouldRenderJsonWhen(fn ($request) => $request->is('api/*'))` is already
configured, renders it as a clean JSON response:

```json
{"message": "Unauthenticated."}
```

**Why `Accept: application/json` was also needed:**

Even with the fix, testing with plain `curl` (no headers) showed full stack
traces in debug mode. Adding `-H "Accept: application/json"` signals to
Laravel that the client expects JSON. Laravel's exception handler checks
`$request->wantsJson()` (which reads the Accept header) before deciding
whether to return JSON or HTML. For API testing, always include this header.

**The engineering lesson:** Any API endpoint that requires authentication
MUST return `{"message":"Unauthenticated."}` with HTTP status 401 for
unauthenticated requests — not an HTML redirect page, not a stack trace.
This is required for:
1. The React app to handle 401 responses programmatically
2. MetaMask SDK to know authentication state
3. Any API client (mobile app, Postman, another service) to handle the error

### 5.6 Test 5 — Vite Proxy End-to-End

```
curl http://localhost:5173/api/users/me -H "Accept: application/json"
Result: {"message":"Unauthenticated."} ✅
```

This single test confirms four things simultaneously:
1. Vite's dev server is running on port 5173
2. The proxy configuration in `vite.config.js` is correctly routing `/api/*`
3. The request reached Laravel on port 8000
4. Laravel returned the correct JSON 401 response

The identical response to Test 4 proves the proxy is transparent — the
client cannot tell whether it spoke to Laravel directly or through the proxy.

### 5.7 Test 6 — MySQL Database State

```
0001_01_01_000000_create_users_table .......... [1] Ran
0001_01_01_000001_create_cache_table .......... [1] Ran
0001_01_01_000002_create_jobs_table ........... [1] Ran
2026_06_20_022832_create_personal_access_tokens_table .. [1] Ran ✅
```

**Why `migrate:status` instead of `db:show`:**

We discovered in the earlier journal that `db:show` queries
`performance_schema.session_status` — a MySQL internal table that is not
populated in this XAMPP build. This is an XAMPP-specific limitation, not
a MySQL limitation.

`migrate:status` queries only the `migrations` table in our own `edl_db`
database — a table we created and control. It is the more targeted and
reliable diagnostic.

**What the `[1] Ran` status means:**

The number in brackets is the **batch number** — migrations run in the same
`php artisan migrate` execution get the same batch number. This means all
four migrations ran in a single batch. If you run `php artisan migrate:rollback`,
it rolls back the entire batch together.

### 5.8 Test 7 — File Count

```
Result: 158 files ✅
```

158 files (excluding `vendor/`, `node_modules/`, lock files) represents:
- ~90 Laravel framework files (configs, stubs, tests)
- ~15 frontend config and source files
- ~10 contracts files (including compiled artifacts)
- ~30 documentation files
- ~13 new scaffold files (.gitkeep, READMEs, stub controllers)

This count will grow to thousands of files by the end of the project as
migrations, models, components, and tests are added.

---

## PART 6 — THE PHASE 4 COMMIT HISTORY

```
5b02c6e chore: scaffold complete production monorepo structure
c111816 chore: add all configuration files (vite, eslint, prettier, routes)
e5cde23 chore: add stub controllers to satisfy route:list reflection
fd51e4b feat: Phase 4 complete — full-stack environment verified and operational
```

**Four commits, not one, because:**

Each commit represents a complete, working state of the project. If `fd51e4b`
introduces a problem discovered next week, you can `git bisect` (binary search
through commits) to find exactly which commit introduced it. One giant commit
makes this impossible.

The commit types:
- `chore` — infrastructure work that is not a user-facing feature
- `feat` — a milestone: the environment is now verified end-to-end

The final commit message deliberately states **"Ready to begin Phase 5"** —
this makes the git log self-documenting. Anyone reading the history knows
exactly what state the project was in at each point.

---

## PART 7 — WHAT EVERY CONFIGURATION FILE PROTECTS AGAINST

| File | Protects Against |
|---|---|
| `vite.config.js` aliases | Broken imports when files are moved |
| `vite.config.js` proxy | CORS errors during development |
| `vite.config.js` code splitting | Slow first load on mobile networks |
| `.eslintrc.cjs` hooks rules | React hooks bugs (wrong state, infinite loops) |
| `.prettierrc` | Inconsistent formatting in git diffs |
| `prettier-plugin-tailwindcss` | Unreadable Tailwind class order conflicts |
| `test/setup.js` MetaMask mock | Tests crashing because window.ethereum is undefined |
| `test/setup.js` ethers mock | Tests making real blockchain calls |
| `api.php` route structure | Feature scope creep (routes define the contract) |
| `bootstrap/app.php` redirectGuestsTo | HTML redirect responses breaking the React app |

---

## APPENDIX — THE FIVE TIERS AT END OF PHASE 4

```
TIER 1 — PRESENTATION (React 18 + Vite)
Status: ✅ Configured and verified
- Dev server: http://localhost:5173
- Proxy: /api/* → http://localhost:8000
- Tailwind: loan-state colour tokens defined
- Testing: jsdom + MetaMask mock + ethers partial mock
- Build: code split into 4 chunks for performance

TIER 2 — APPLICATION (Laravel 13 + Sanctum)
Status: ✅ Configured and verified
- API server: http://localhost:8000
- 25 routes registered and resolvable
- auth:sanctum: returns JSON 401 (not HTML redirect)
- Queue: Redis driver configured
- KYC storage: storage/app/kyc_documents/

TIER 3 — SMART CONTRACTS (Solidity 0.8.20 + Hardhat)
Status: ✅ Configured and verified
- Compiler: 0.8.20 with optimizer (200 runs)
- Source path: contracts/src/
- ABI extraction script: extract-abis.js ready
- Stub contracts: EDLPlaceholder compiles and deploys

TIER 4 — BLOCKCHAIN (Ganache v7.9.2)
Status: ✅ Running and verified
- RPC: http://127.0.0.1:8545
- Chain ID: 1337, Network ID: 1337
- 10 accounts, each 1000 ETH
- Deployer: 0x90F8bf6A...Ea8c9C1

TIER 5 — DATA (MySQL 8.x via XAMPP)
Status: ✅ Accessible and verified
- Database: edl_db
- 4 default migrations: Ran
- 16 EDL-specific tables: designed, not yet created (Phase 5)
```

---

## WHAT COMES NEXT — PHASE 5 PREVIEW

Phase 5 is **Database Design and Migrations** — creating all 16 MySQL tables
that mirror the on-chain state and store off-chain data.

The tables to be created:
```
users                    — all six actor types
loans                    — mirrors LoanContract state
loan_guarantors          — tracks guarantor commitments
loan_funders             — tracks lender contributions
repayments               — payment history (mirrors on-chain)
credit_scores            — reputation scores (mirrors on-chain)
kyc_documents            — SHA-256 hashes + document metadata
audit_log                — immutable record of all system actions
notifications            — user notifications from blockchain events
blacklist                — mirrors IdentityRegistry blacklist
hash_integrity_log       — verifies on-chain vs off-chain hash agreement
merkle_root_cache        — stores per-block Merkle roots for fast audit
transaction_performance_log — NFR-004 monitoring data
privacy_audit_log        — NFR-009 compliance: every PII access logged
node_health_log          — NFR-003 uptime monitoring
gas_cost_log             — NFR-007 cost tracking
```

Each table will be created as a Laravel migration file, then a corresponding
Eloquent model, and finally factory classes for seeding test data.

---

*End of Engineering Journal — Phase 4: Production Structure and Configuration*
*Next journal entry will cover: Phase 5 — Database Design and Migrations*
