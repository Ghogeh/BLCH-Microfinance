# Engineering Journal — Phase 10
## React Frontend Implementation: M9 → M12
### EDL Microfinance · University of Bamenda · MSc Computer Engineering

**Written by:** Claude Sonnet 4.6 (Senior Engineer perspective)  
**For:** Carl Ghogeh Vezhugho (UBA25EP054)  
**Date:** 2026-06-24  
**Branch merged:** milestone/M9-frontend-auth → develop  

---

> **How to read this document:**  
> Think of this as a conversation between a senior software engineer and you, the intern.
> I will explain not just *what* we built, but *why* every decision was made, *what could
> go wrong*, and *what the science is behind each piece*. By the end, you should be able
> to explain every file in the frontend to anyone — including your dissertation committee.

---

## Part 1 — What We Built (The Big Picture)

Before Phase 10, the EDL project had:
- A Solidity smart contract layer (M2, M3) — the blockchain brain
- A Laravel backend API layer (M5–M8) — the server middleware
- A MySQL database layer (M4) — the off-chain ledger

What was missing was the **face of the system** — the web application that real users
(entrepreneurs, lenders, officers, regulators) actually open in their browser.

Phase 10 built the complete React frontend: **10 fully working pages for 4 different
user roles**, all connected to MetaMask (the blockchain wallet), the Laravel API, and
the smart contracts on Ganache.

### The 10 pages we built:

| Page | Route | Who sees it | What it does |
|---|---|---|---|
| LoginPage | `/login` | Everyone | Connect MetaMask, sign challenge, log in |
| KYCPage | `/kyc` | Any authenticated user | Upload identity document |
| BorrowerDashboard | `/dashboard` | Entrepreneurs | Credit score, active loan, history |
| LoanRequestPage | `/loans/new` | Entrepreneurs (KYC verified) | Submit createLoan() to blockchain |
| RepaymentPage | `/loans/:id/repay` | Entrepreneurs | Pay back a loan installment |
| LenderDashboard | `/lender` | Lenders | See fundable loans, submit fund() |
| OfficerPanel | `/officer` | MFI Officers | Review and approve/reject KYC submissions |
| AuditPortal | `/audit` | COBAC Regulators | Full ledger, Merkle verification, blacklist |
| LoanDetailPage | `/loans/:id` | Any authenticated user | View a specific loan |
| CreditPassport | `/credit-passport/:wallet` | Lenders, Regulators | Cross-institution credit history |

---

## Part 2 — The Provider Stack (The Foundation)

This is the most important architectural decision in the entire frontend. Before a single
page renders, we set up a **stack of providers** in `main.jsx`.

### What is a Provider?

In React, a "Provider" is a component that makes data available to every component
below it in the tree. It is React's built-in solution to the problem of "prop drilling"
— passing the same data through ten components just to get it to one child at the bottom.

Think of it like a building's electrical system. Instead of each room having its own
generator, there is one main supply (the provider) and every room just plugs in (using
a hook like `useWallet()`).

### Our Provider Stack (reading from outer to inner):

```
<BrowserRouter>            ← "What URL is the user on?"
  <QueryClientProvider>    ← "Cache for API data (React Query)"
    <WalletProvider>       ← "MetaMask state (address, signer, chainId)"
      <AuthProvider>       ← "Sanctum token + user role"
        <App />            ← The actual application pages
        <Toaster />        ← Toast notification system
      </AuthProvider>
    </WalletProvider>
    <ReactQueryDevtools /> ← Dev-only panel for inspecting query cache
  </QueryClientProvider>
</BrowserRouter>
```

### Why this exact order matters:

**`BrowserRouter` is outermost** because everything — even providers — might need to
read the current URL. If you put `BrowserRouter` inside `WalletProvider`, the wallet
provider cannot use `useLocation()` or `useNavigate()`.

**`QueryClientProvider` wraps the wallet and auth providers** because `WalletContext`
and `AuthContext` themselves might use React Query internally. Putting it outside means
it is always available.

**`WalletProvider` wraps `AuthProvider`** because `AuthContext` needs to read wallet
state (`address`, `signer`, `isConnected`) to perform the login flow. If you swapped
them, `AuthContext` would call `useWallet()` and get `null` — it would crash.

**`AuthProvider` is the innermost data provider** because it depends on everything
above it but nothing depends on it (except the pages themselves).

This ordering is not obvious to beginners. It is the kind of thing that takes 20 minutes
to set up correctly and 3 hours to debug if you get it wrong. The rule is:
**a provider that depends on another provider must be nested inside it.**

---

## Part 3 — WalletContext: Talking to MetaMask

### What is MetaMask?

MetaMask is a browser extension that acts as an **Ethereum wallet manager**. When
installed, it injects a JavaScript object called `window.ethereum` into every webpage
you visit. This object is your bridge to the blockchain.

`window.ethereum` is not a database connection or an API endpoint. It is a JavaScript
interface to a cryptographic key management system running locally on the user's computer.
The user's private key never leaves their machine.

### The `ethers.BrowserProvider` bridge

We do not talk to `window.ethereum` directly. Instead, we use the `ethers.js` library
as a higher-level abstraction:

```javascript
const ethProvider = new ethers.BrowserProvider(window.ethereum)
```

`BrowserProvider` takes the raw `window.ethereum` injection and wraps it in a clean API
with methods like `getSigner()`, `getNetwork()`, and `send()`. It is similar to how you
use an ORM (like Eloquent in Laravel) instead of writing raw SQL — the underlying
database is still there, but you work through a cleaner abstraction.

### The Three Objects We Need

From a connected wallet, we get three objects that WalletContext stores in state:

```javascript
const ethProvider = new ethers.BrowserProvider(window.ethereum)
const ethSigner   = await ethProvider.getSigner()
const userAddress = await ethSigner.getAddress()
```

**`provider`** — Can read from the blockchain. Used for `eth_call` (read-only
operations). Does not need the user's private key.

**`signer`** — Can write to the blockchain. Used for `eth_sendTransaction`. It
holds a reference to the user's private key (inside MetaMask — never exposed to your
JavaScript code). Every blockchain state change requires a signer.

**`address`** — The user's public wallet address (like their "username" on the blockchain).
This is what you share publicly. The address is derived mathematically from the private key
but cannot be used to recover the private key.

### The `connect()` Flow, Step by Step

```javascript
const connect = useCallback(async () => {
  const ethProvider = new ethers.BrowserProvider(window.ethereum)
  await ethProvider.send('eth_requestAccounts', [])  // ← triggers MetaMask popup
  const ethSigner   = await ethProvider.getSigner()
  const userAddress = await ethSigner.getAddress()
  const network     = await ethProvider.getNetwork()
  // ...
}, [])
```

**Step 1 — `eth_requestAccounts`:** This is the MetaMask popup that says "EDL wants to
connect to your wallet. Allow?" If the user clicks Allow, they are giving this website
permission to *see* their address. Not to spend their funds — just to see the address.
If they click Reject, `error.code === 4001` and we show a toast message.

**Step 2 — `getSigner()`:** Gets an object that can sign transactions. The private key
stays inside MetaMask. When you call `signer.signMessage(text)`, MetaMask pops up another
dialog: "EDL wants you to sign this message: [text]. Sign?" The user sees the message
and approves it.

**Step 3 — `getAddress()`:** Reads the currently selected wallet address from MetaMask.
We `.toLowerCase()` it because Ethereum addresses are case-insensitive but some APIs
return them in checksummed mixed-case format. Storing lowercase prevents comparison
bugs like `"0xAbCd" !== "0xabcd"`.

**Step 4 — `getNetwork()`:** Reads the current chain ID. For Ganache it returns
`BigInt(1337)`. We convert to decimal and compare against `VITE_CHAIN_ID=1337` from
the `.env` file. If the user is on mainnet (chainId=1) instead of our local test
network, we show a warning and disable the Sign In button.

### `getContract()` — The On-Chain Call Factory

```javascript
const getContract = useCallback((contractAddress, abi) => {
  if (!signer) throw new Error('Wallet not connected.')
  return new ethers.Contract(contractAddress, abi, signer)
}, [signer])
```

This is one of the most powerful patterns in the frontend. Instead of hardcoding
contract calls everywhere, each page calls `getContract(address, abi)` and gets back
a **Contract object** — a JavaScript proxy that maps ABI function names to real
blockchain transactions.

For example, after calling `getContract(LOAN_FACTORY_ADDRESS, LOAN_FACTORY_ABI)`,
you can do:

```javascript
const factory = getContract(LOAN_FACTORY_ADDRESS, LOAN_FACTORY_ABI)
await factory.createLoan(amountWei, durationDays, interestBps)
```

This looks like a normal JavaScript function call, but under the hood ethers.js:
1. ABI-encodes the function selector + parameters
2. Creates an Ethereum transaction
3. Sends it to MetaMask for signing
4. Broadcasts the signed transaction to Ganache
5. Waits for the receipt

The entire complexity of low-level ABI encoding (which we built manually in PHP in
Phase 9!) is handled automatically by ethers.js when given an ABI.

### Event Listeners — Reacting to MetaMask Changes

```javascript
window.ethereum.on('accountsChanged', (accounts) => {
  if (accounts.length === 0) disconnect()
  else setAddress(accounts[0].toLowerCase())
})
window.ethereum.on('chainChanged', (chainIdHex) => {
  setChainId(parseInt(chainIdHex, 16))
})
```

MetaMask is a live browser extension. The user can switch accounts or switch networks
at any time — even while your app is open. Without these event listeners, your app
would show stale data: "Connected as 0xAlice" even though Alice just switched to Bob's
account in MetaMask.

**`accountsChanged`** fires when the user switches accounts or disconnects all accounts.
**`chainChanged`** fires when the user switches networks (Ganache → mainnet → Polygon, etc.)

Note that `chainChanged` is passed the chain ID as a **hex string** (e.g. `"0x539"`)
not a decimal number. `parseInt("0x539", 16)` converts it to `1337`.

**Critical cleanup:** We must call `window.ethereum.removeListener()` when the
`WalletProvider` unmounts. If we don't, the listeners continue running even after the
component is gone, causing memory leaks and "cannot update state on unmounted component"
warnings in React.

---

## Part 4 — AuthContext: The Login Protocol

### Why Wallet Signatures Replace Passwords

In a traditional web app, you prove your identity with a username and password. The
server hashes your password and compares it to what is stored in the database.

In the EDL system, your identity is your Ethereum address. Proving you own an address
means proving you own the corresponding private key — without ever revealing that key.

The protocol is called **ECDSA signature verification**. Here is the full flow:

```
1. Frontend: GET /api/auth/nonce?wallet=0xAlice
   Backend: "Sign this to prove you own 0xAlice: EDL Login 1751234567 abc123"
   
2. Frontend: MetaMask signs the nonce with Alice's private key → signature (65 bytes)

3. Frontend: POST /api/auth/verify { wallet: "0xAlice", signature: "0xabcdef..." }
   Backend: ecrecover(nonce_text, signature) → recovered_address
   Backend: if recovered_address === "0xAlice" → they own the key → issue Sanctum token
```

The mathematics: Signing with a private key produces a signature `(r, s, v)`. Given only
the signature and the original message, `ecrecover()` can mathematically derive the public
key that produced the signature. From the public key, we derive the address. If it matches
the claimed wallet address, identity is proven. No password database needed — ever.

### The Nonce is a One-Time Challenge

The word "nonce" comes from cryptography and stands for "**n**umber used **once**."

```javascript
const { data: nonceData } = await api.get(`/auth/nonce?wallet=${address}`)
const signature = await signer.signMessage(nonceData.message)
```

Why does the nonce contain a timestamp (`1751234567`) and a random string (`abc123`)?
To prevent **replay attacks**. Without randomness, an attacker who intercepted Alice's
signature once could replay it to log in as Alice later. With a fresh random nonce each
time, yesterday's signature is worthless today because the backend only accepts
signatures of the exact current nonce (which expires in 5 minutes).

### Token Storage in `localStorage`

After successful login, we store two things:

```javascript
localStorage.setItem('edl_token', authData.token)
localStorage.setItem('edl_user', JSON.stringify(authData.user))
```

**Why `localStorage` and not a cookie?**

In a traditional web app, session cookies are the best choice. But this is a **SPA
(Single Page Application)** communicating with a separate API domain. Cross-origin
cookies require complex CORS and SameSite configuration. The simpler pattern for SPAs
is a Bearer token in `localStorage`, sent in the `Authorization: Bearer xxx` header.

**The rehydration pattern:**

```javascript
useEffect(() => {
  if (!token) { setIsLoading(false); return }
  api.get('/users/me')
    .then(({ data }) => setUser(data.user))
    .catch(() => logout())       // token expired or revoked
    .finally(() => setIsLoading(false))
}, [token])
```

When the user refreshes the browser, React state is lost — but `localStorage` persists.
On mount, `AuthContext` reads the stored token and calls `/users/me` to re-fetch the user
profile. If the token is still valid, the user stays logged in. If the server returns 401
(expired/revoked), `logout()` is called to clean up. This is the standard SPA
authentication rehydration pattern.

### Role Convenience Flags

```javascript
const value = {
  // ...
  isEntrepreneur: user?.role === 'entrepreneur',
  isLender:       user?.role === 'lender',
  isOfficer:      user?.role === 'officer',
  isRegulator:    user?.role === 'regulator',
  isKYCVerified:  user?.kyc_status === 'verified',
  isBlacklisted:  user?.blacklisted === true,
}
```

Instead of writing `user?.role === 'entrepreneur'` in every component that needs to
show role-specific content, we compute these flags once in the context and export them.
Components call `const { isEntrepreneur } = useAuth()` and use it directly.

The `?.` is JavaScript optional chaining — it returns `undefined` instead of crashing
if `user` is `null` (which it is before login). `undefined === 'entrepreneur'` is
`false`, which is the correct default.

---

## Part 5 — Route Guards: Access Control in the Browser

### The Three Guard Components

We built three separate guard components rather than one combined guard:

**`RequireAuth`** — "Are you logged in?"
```javascript
if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />
```

**`RequireRole`** — "Do you have the right role?"
```javascript
const allowed = Array.isArray(role) ? role : [role]
if (!allowed.includes(user.role)) {
  const homeRoute = ROLE_CONFIG[user.role]?.home || '/dashboard'
  return <Navigate to={homeRoute} replace />
}
```

**`RequireKYC`** — "Has your identity been verified?"
```javascript
if (user.kyc_status !== 'verified') return <Navigate to="/kyc" replace />
```

### Why Three Components Instead of One?

Because different routes need different combinations:

```jsx
{/* Only needs auth */}
<Route path="/loans/:id" element={<RequireAuth><LoanDetailPage /></RequireAuth>} />

{/* Needs auth + role */}
<Route path="/lender" element={
  <RequireAuth><RequireRole role="lender"><LenderDashboard /></RequireRole></RequireAuth>
} />

{/* Needs auth + role + KYC */}
<Route path="/loans/new" element={
  <RequireAuth>
    <RequireRole role="entrepreneur">
      <RequireKYC>
        <LoanRequestPage />
      </RequireKYC>
    </RequireRole>
  </RequireAuth>
} />
```

If we had one combined `<Guard auth role="entrepreneur" kyc>` component, we would need
to add props for every possible combination. Three small composable components are more
flexible than one large configurable one. This is the **Single Responsibility Principle**
applied to React components.

### The `state={{ from: location }}` Pattern

When `RequireAuth` redirects to `/login`, it passes the attempted URL:

```javascript
return <Navigate to="/login" state={{ from: location }} replace />
```

And `LoginPage` reads it after login:

```javascript
useEffect(() => {
  if (isAuthenticated && user) {
    const from     = location.state?.from?.pathname
    const roleHome = ROLE_CONFIG[user.role]?.home || '/dashboard'
    navigate(from || roleHome, { replace: true })
  }
}, [isAuthenticated, user])
```

This creates a seamless redirect flow:
1. User tries to open `/loans/123/repay`
2. Not logged in → redirected to `/login` with `from = "/loans/123/repay"` in state
3. User connects wallet and logs in
4. `LoginPage` reads `from` and navigates to `/loans/123/repay`
5. User lands exactly where they intended to go

Without this pattern, every login would dump the user on their home dashboard regardless
of where they were trying to go.

---

## Part 6 — Code Splitting with lazy() and Suspense

### The Performance Problem

If we imported all 10 page components at the top of `App.jsx`, every user would download
all 10 pages on their first visit — even if they only need 1.

An entrepreneur who only uses the borrower dashboard should not download the AuditPortal
code. A regulator who only uses the audit portal should not download the LoanRequestPage
form validation library.

### The Solution: Dynamic Imports

```javascript
const BorrowerDashboard = lazy(() => import('./pages/Dashboard/BorrowerDashboard'))
const AuditPortal       = lazy(() => import('./pages/Audit/AuditPortal'))
// ...
```

`lazy()` takes a function that returns a `Promise<{default: Component}>`. The import
only happens when React actually tries to render that component for the first time.

```jsx
<Suspense fallback={<PageLoader />}>
  <Routes>
    <Route path="/dashboard" element={<BorrowerDashboard />} />
    <Route path="/audit"     element={<AuditPortal />} />
  </Routes>
</Suspense>
```

`Suspense` catches the "pending" state of the dynamic import and shows `<PageLoader />`
(our spinning indicator) until the chunk finishes downloading. Once downloaded, the chunk
is cached by the browser — subsequent visits to that route are instant.

### The Build Output Proves It Works

```
LoginPage.js          3.00 KB   ← downloaded immediately (it's on the /login route)
BorrowerDashboard.js  6.04 KB   ← only downloaded when entrepreneur logs in
LoanRequestPage.js   88.42 KB   ← large because it includes zod + react-hook-form
AuditPortal.js        6.37 KB   ← only downloaded when regulator logs in
ethers.js           272.64 KB   ← only downloaded when a tx page renders
```

The regulators who use the audit portal never download `LoanRequestPage.js` (88 KB).
Entrepreneurs never download `AuditPortal.js`. Everyone's initial load is just the
`index.js` (100 KB), `vendor.js` (160 KB), and whatever page they land on.

This is called **route-based code splitting** and is considered best practice for any
React SPA with multiple user roles.

---

## Part 7 — React Query: Data Fetching Done Right

### The Problem React Query Solves

Without React Query, you would write this for every data-fetching component:

```javascript
const [data, setData]       = useState(null)
const [loading, setLoading] = useState(true)
const [error, setError]     = useState(null)

useEffect(() => {
  setLoading(true)
  api.get('/loans')
    .then(r => setData(r.data))
    .catch(e => setError(e))
    .finally(() => setLoading(false))
}, [])
```

That is 10 lines for every API call, no caching, no background refresh, and no
deduplication (if three components on the same page all call `/loans`, you get three
identical requests).

### React Query's Approach

```javascript
const { data: loansData, isLoading } = useQuery({
  queryKey: ['my-loans'],
  queryFn:  () => api.get('/loans').then(r => r.data),
})
```

Three things happen automatically:
1. **Caching:** The result is cached under the key `['my-loans']`. Any other component
   using this same key gets the cached result immediately.
2. **Deduplication:** If three components call this query simultaneously, only one
   HTTP request is sent.
3. **Background refetch:** When the user returns to the tab after being away, React Query
   silently re-fetches to check for updates.

The `staleTime: 60_000` in `QueryClient` config means "treat cached data as fresh for
60 seconds before re-fetching in the background."

### `useMutation` for Write Operations

```javascript
const mutation = useMutation({
  mutationFn: async (data) => {
    const tx = await factory.createLoan(...)
    await tx.wait()
    await api.post('/loans', data)
    return tx.hash
  },
  onSuccess: () => {
    qClient.invalidateQueries({ queryKey: ['my-loans'] })
    toast.success('Loan created!')
  },
  onError: (error) => toast.error(error.message),
})
```

`useMutation` handles write operations (blockchain transactions + API calls). The key
feature is `onSuccess: () => qClient.invalidateQueries(...)` — after a successful
write, we tell React Query to mark the relevant cached data as stale. It then
**automatically re-fetches** that data in the background. The dashboard updates without
the user needing to refresh.

This is the pattern that makes the system feel "live" — submit a repayment, and within
seconds the remaining balance and credit score update on screen.

### Triple Query Invalidation on Repayment

```javascript
onSuccess: (txHash) => {
  qClient.invalidateQueries({ queryKey: ['loan', id] })
  qClient.invalidateQueries({ queryKey: ['my-loans'] })
  qClient.invalidateQueries({ queryKey: ['credit-score'] })
}
```

A repayment touches three different data sets:
- The individual loan (`remaining_balance` decreases)
- The loans list (same loan in the list needs updating)
- The credit score (successful repayment improves the score)

All three caches are invalidated and re-fetched in the background simultaneously.
Without the credit-score invalidation, the gauge on the dashboard would show the
old score until the user navigated away and came back.

---

## Part 8 — Form Validation with Zod + React Hook Form

### The LoanRequestPage Form Stack

```javascript
const schema = z.object({
  amount_cfa: z.number()
    .min(50000,  'Minimum loan amount is CFA 50,000')
    .max(500000, 'Maximum loan amount is CFA 500,000'),
  duration_days: z.number().min(7).max(365),
  interest_rate_bps: z.number().min(0).max(3000),
  required_guarantees: z.number().min(1).max(10),
})

const { register, handleSubmit, watch, formState: { errors } } = useForm({
  resolver: zodResolver(schema),
  defaultValues: { amount_cfa: 100000, duration_days: 30, ... },
})
```

**Zod** is a TypeScript-first schema validation library. `z.object({...})` declares what
valid data looks like. `.min()`, `.max()`, and custom message strings provide error text.

**React Hook Form** manages the form state (which fields have been touched, which have
errors, what the current values are). It uses `register('field_name')` to attach itself
to native HTML inputs with zero re-renders during typing (unlike controlled `useState`
forms which re-render on every keystroke).

**`zodResolver`** is the bridge: it plugs the Zod schema into React Hook Form so that
when the user submits, the form validates against the schema before calling your
submit handler. If validation fails, errors appear automatically without you writing
a single `if/else` check.

**`{ valueAsNumber: true }`** in `register('amount_cfa', { valueAsNumber: true })` is
important: HTML `<input type="number">` still returns a string. Without `valueAsNumber`,
`data.amount_cfa` would be the string `"100000"` and `z.number()` would reject it.
This tells React Hook Form to call `parseFloat()` automatically.

### Live Preview with `watch()`

```javascript
const amountCFA   = watch('amount_cfa')
const interestBps = watch('interest_rate_bps')
const totalRepay  = amountCFA + (amountCFA * interestBps / 10000)
```

`watch()` subscribes to field changes and returns the current value. As the user types
in the amount field, `amountCFA` updates in real time and the repayment summary
recalculates. This creates the live preview box that shows "Principal: 100,000 FCFA,
Interest (10%): 10,000 FCFA, Total: 110,000 FCFA" without any button press.

---

## Part 9 — Shared Component Library

### Why a Shared Component Library?

Without shared components, every page that shows a loan would independently decide
what colour "ACTIVE" should be, what font size to use, whether to show a border.
With 10 pages and 5 loan states, that is 50 independent decisions that will inevitably
be inconsistent.

### `LoanStateBadge` — Single Source of Truth for State Colours

```javascript
export const LOAN_STATES = {
  OPEN:      { label: 'Open',     bg: 'bg-blue-50',  text: 'text-blue-700',  ... },
  FUNDING:   { label: 'Funding',  bg: 'bg-amber-50', text: 'text-amber-700', ... },
  ACTIVE:    { label: 'Active',   bg: 'bg-emerald-50',...},
  REPAID:    { label: 'Repaid',   bg: 'bg-indigo-50',...},
  DEFAULTED: { label: 'Defaulted',bg: 'bg-red-50',   ...},
}

export default function LoanStateBadge({ state }) {
  const config = LOAN_STATES[state] || LOAN_STATES.OPEN
  return <span className={cn(config.bg, config.text, ...)}>{config.label}</span>
}
```

If your supervisor says "make DEFAULTED orange instead of red", you change one line
in `loanConfig.js` and it updates on all 10 pages simultaneously. That is the power
of a single source of truth.

### `CreditScoreGauge` — The SVG Donut Chart

This component involves some geometry worth understanding:

```javascript
const circumference = 2 * Math.PI * 40  // = 251.3
const offset        = circumference - (pct / 100) * circumference
```

**How the donut works:**

An SVG `<circle>` with `stroke-dasharray="251.3"` draws the entire circle as one
251.3-unit dash with no gap. By setting `stroke-dashoffset`, we "push" where the dash
starts. If `score = 70`:

```
offset = 251.3 - (70/100) * 251.3
       = 251.3 - 175.9
       = 75.4
```

So 75.4 units of the dash are hidden (pushed off the start), and 175.9 units are
visible — exactly 70% of the circle. The `-rotate-90` on the SVG element rotates
the starting point from the right (3 o'clock) to the top (12 o'clock), which is
more intuitive for a score gauge.

**The CSS transition:**
```
className="transition-all duration-700 ease-out"
```
When the score updates after a successful repayment, the needle animates smoothly
over 700 milliseconds rather than jumping instantly. This gives the user visible
feedback that the score changed.

### `DataTable` — Generic Table with Column Config

```javascript
const columns = [
  { key: 'amount_cfa', label: 'Amount', render: v => formatCFA(v) },
  { key: 'state',      label: 'Status', render: v => <LoanStateBadge state={v} /> },
  { key: '_actions',   label: '',       render: (_, row) => <button>View</button> },
]

<DataTable columns={columns} rows={loans} isLoading={loansLoading} />
```

The `render: (value, row) => JSX` callback pattern is the key design decision.
Cells can contain text, badges, links, or buttons — the table component itself does
not care. It just calls your render function and puts the result in the cell.

The skeleton loader uses the same column count:
```javascript
{isLoading && [...Array(3)].map((_, i) => (
  <div className="animate-pulse h-4 bg-gray-100 rounded" />
))}
```
Three rows of grey bars appear in the correct column layout while data loads. This
prevents "layout shift" — the page looks complete and stable while waiting for data.

### `cn()` — Conflict-Free Tailwind Class Merging

```javascript
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
```

**`clsx`** handles conditional class logic:
```javascript
clsx('px-4', isActive && 'bg-blue-600', false && 'text-red-500')
// → "px-4 bg-blue-600"
```

**`tailwind-merge`** resolves Tailwind conflicts:
```javascript
twMerge('px-4 py-2', 'py-3')
// → "px-4 py-3"  (py-2 is removed, py-3 wins)
```

Without `tailwind-merge`, `"px-4 py-2 py-3"` would have two conflicting padding
utilities. The browser applies both — and which one wins depends on their order in
the CSS file, not the order in your className string. This leads to unpredictable bugs.
`tailwind-merge` solves this by intelligently removing the earlier conflicting utility.

---

## Part 10 — The Utility Layer

### `formatCFA()` — CEMAC Currency Formatting

```javascript
export function formatCFA(amount) {
  return new Intl.NumberFormat('fr-CM', {
    style: 'currency', currency: 'XAF',
    maximumFractionDigits: 0,
  }).format(amount)
}
// 150000 → "150 000 FCFA"
```

`Intl.NumberFormat` is a built-in JavaScript internationalisation API. Using locale
`'fr-CM'` (French as spoken in Cameroon) formats numbers with spaces as thousands
separators (not commas — that is the European/French convention). `currency: 'XAF'`
is the ISO 4217 code for the Central African CFA franc, and the browser resolves
the symbol to "FCFA" automatically.

Never format currency with `amount.toFixed(2)` — it does not handle thousands
separators and ignores locale conventions. Always use `Intl.NumberFormat`.

### `apiClient.js` — The 401 Auto-Redirect

```javascript
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('edl_token')
      localStorage.removeItem('edl_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
```

This interceptor fires on **every** API response. If any request gets a 401
(Unauthorized — token expired or revoked), it automatically:
1. Clears stored credentials
2. Redirects to `/login`

Without this, after a token expires, every API call would silently fail with 401 errors
and the user would see a broken dashboard with no explanation. With the interceptor,
they are cleanly redirected to log in again.

### `contractABI.js` — Why Minimal ABI Fragments?

```javascript
export const LOAN_FACTORY_ABI = [
  'function createLoan(uint256 amount, uint256 durationDays, uint256 interestRateBps) external returns (address)',
  'function getBorrowerLoans(address borrower) external view returns (address[])',
  // ...
]
```

The full Hardhat artifact for `LoanFactory.sol` is a 376-entry JSON object containing:
- Full ABI (what we need)
- Bytecode (the compiled contract — not needed in the frontend)
- Source mapping (debugging info — not needed in the frontend)
- Storage layout (internal structure — not needed in the frontend)

By importing only the function signatures we actually call, we:
1. Reduce bundle size (2.1 KB vs 376-line JSON)
2. Make every on-chain call site searchable in one file
3. Prevent accidentally calling functions we didn't intend to expose

Ethers.js accepts both full ABI JSON and these "human-readable ABI" string fragments.
It parses the string format at runtime — no performance difference.

---

## Part 11 — Bugs Found and Fixed

This section is particularly valuable. Bugs in this phase were more conceptual than
syntactic — they required understanding the mock system, the module system, and the
React rendering lifecycle.

### Bug 1 — The Namespace Import Mock Gap

**What happened:**
```javascript
// WalletContext.jsx
import { ethers } from 'ethers'
new ethers.BrowserProvider(window.ethereum)  // ← uses namespace
```
```javascript
// test/setup.js (before fix)
BrowserProvider: vi.fn().mockImplementation(...)  // ← mocks named export only
```

**Why it failed:** When you write `import { ethers } from 'ethers'`, you get the
`ethers` namespace object — a JavaScript object where `ethers.BrowserProvider` is a
property. When you write `import { BrowserProvider } from 'ethers'`, you get the
`BrowserProvider` class directly. The mock replaced the named export but left the
namespace property pointing to the real class.

**Fix:**
```javascript
const MockBrowserProvider = vi.fn().mockImplementation(() => ({...}))
return {
  ...actual,
  BrowserProvider: MockBrowserProvider,      // for named imports
  ethers: {                                  // for namespace imports
    ...actual.ethers,
    BrowserProvider: MockBrowserProvider,
  },
}
```

**Lesson:** When mocking ES modules, consider all import styles that consume the module.
`import { X }` and `import { namespace }` then `namespace.X` can both appear in the
same codebase and need separate mock entries.

### Bug 2 — `BrowserProvider.send()` Not Mocked

**What happened:** The new `WalletContext` triggers the MetaMask popup via:
```javascript
await ethProvider.send('eth_requestAccounts', [])
```

The previous codebase used `window.ethereum.request({ method: 'eth_requestAccounts' })`.
These are different: one calls through the ethers provider abstraction, the other
calls `window.ethereum` directly.

The mock `BrowserProvider` had `getSigner` and `getNetwork` but not `send`. When
`connect()` called `ethProvider.send(...)`, it got `undefined()` which threw
`TypeError: ethProvider.send is not a function`. The catch block silently swallowed
the error and `address` stayed `null`.

**Fix:** Added `send: vi.fn().mockResolvedValue([...])` to the mock provider instance.

**Lesson:** When you update the implementation of a function (from `window.ethereum.request`
to `ethProvider.send`), you must update the mocks. The tests were testing the *old*
interface and passing, giving false confidence. This is why integration tests that run
against real Ganache (not mocks) are necessary — they catch interface changes that
unit mocks miss.

### Bug 3 — Mock Path Mismatch (AuthContext)

**What happened:**
```javascript
// Original AuthContext.jsx
import api from '@/lib/api'

// New AuthContext.jsx
import api from '../utils/apiClient'

// Test (before fix)
vi.mock('@/lib/api', ...)  // ← still mocking the old path
```

Vitest's mock system matches on the **exact string used in the import statement** of the
module under test. When `AuthContext.jsx` switched from `@/lib/api` to
`../utils/apiClient`, the old mock stopped intercepting the real Axios calls.
Tests that called `login()` were hitting actual HTTP requests (which failed with
`ECONNREFUSED` since no Laravel was running in the test environment).

**Fix:** Changed `vi.mock('@/lib/api', ...)` to `vi.mock('@/utils/apiClient', ...)`.

**Lesson:** This is a class of bug that appears frequently when refactoring imports.
Always search for mock path strings after renaming an import. A linter rule for this
does not exist — it requires awareness.

### Bug 4 — Three-Call API Mock Sequence

**What happened in the login test:**
```javascript
api.get.mockResolvedValueOnce({ data: { message: MOCK_NONCE } })   // call 1: /auth/nonce
api.post.mockResolvedValueOnce({ data: { token: TOKEN, user: USER } })  // call 2: /auth/verify
// (missing call 3!)
```

The `login()` function does:
1. GET `/auth/nonce` → uses mock #1 ✓
2. POST `/auth/verify` → uses mock #1 for POST ✓
3. Token stored → `useEffect([token])` fires → GET `/users/me` → **no mock** → returns `undefined`
4. `undefined.then()` → `TypeError: Cannot read properties of undefined (reading 'then')`

**Fix:**
```javascript
api.get.mockResolvedValueOnce({ data: { message: MOCK_NONCE } })    // /auth/nonce
api.post.mockResolvedValueOnce({ data: { token: TOKEN, user: USER } })  // /auth/verify
api.get.mockResolvedValueOnce({ data: { user: USER } })              // /users/me (triggered by token effect)
```

**Lesson:** When testing a function that has **side effects** (setting state that
triggers other effects), you must trace the full call chain, not just the direct calls.
The `useEffect([token])` is an indirect consequence of `login()` that the test must
anticipate. Drawing a sequence diagram before writing complex tests helps.

### Bug 5 — JSX in a `.js` Test File

**What happened:**
```javascript
// useWallet.test.js
const wrapper = ({ children }) => <WalletProvider>{children}</WalletProvider>
// ↑ JSX syntax in a .js file
```

Vite's `@vitejs/plugin-react` only transforms JSX in files with `.jsx` or `.tsx`
extensions. A `.js` file with JSX causes the error:
`Failed to parse source for import analysis because the content contains invalid JS syntax`

**Fix:** Renamed `useWallet.test.js` → `useWallet.test.jsx`.

**Lesson:** JSX is not JavaScript. It is a syntax extension that requires a
transformation step (Babel/esbuild/SWC). The file extension signals to the build
tool whether to apply that transformation. This is a common confusion for beginners
who see JSX and JavaScript used together so often they forget they are distinct.

---

## Part 12 — The KYCPage: Understanding the Upload Flow

### react-dropzone Internals

```javascript
const { getRootProps, getInputProps, isDragActive } = useDropzone({
  onDrop,
  accept: { 'application/pdf': [], 'image/jpeg': [], 'image/png': [] },
  maxSize: 5 * 1024 * 1024,
  multiple: false,
})
```

`useDropzone` returns two sets of props:
- `getRootProps()` goes on the container `div` — it handles drag-over highlighting,
  click-to-open-picker, and keyboard accessibility
- `getInputProps()` goes on a hidden `<input type="file">` — it handles the actual
  file selection

The `accept` object maps MIME types to file extensions. When the user drops a file,
the library checks its MIME type against this list and rejects non-matching files
before your `onDrop` callback is even called.

### The `e.stopPropagation()` on Remove

```javascript
<button onClick={e => { e.stopPropagation(); setFile(null) }}>Remove</button>
```

This button is inside the dropzone container which has `onClick` from `getRootProps()`.
In DOM event propagation, a click on a child element "bubbles up" to parent elements.
Without `stopPropagation()`, clicking Remove would:
1. Clear the file (what we want)
2. Also trigger the dropzone's click handler (opens the file picker immediately)

The user would click Remove and immediately be asked to pick a new file — confusing UX.
`stopPropagation()` tells the browser "this click ends here, don't bubble up."

### The Privacy Statement (Engineering Perspective)

```
"Your document is encrypted and stored off-chain. Only its SHA-256 hash is submitted
to the blockchain."
```

This is not just UI copy — it describes an architectural decision made in Phase 9 (M6):
1. Document → SHA-256 hash computed in PHP before encryption
2. AES-256-CBC encryption applied → stored in `storage/app/kyc/`
3. Only the 32-byte hash is sent to the IdentityRegistry smart contract
4. On-chain: `registerIdentity(wallet, keccak256(sha256Hash), role)`

The document never touches the blockchain. The blockchain only stores a cryptographic
fingerprint that cannot be reversed to the original document. This is legally important
for GDPR/CEMAC data protection compliance — personal documents on a public ledger
would be a privacy violation.

---

## Part 13 — The AuditPortal: Why `useMutation` for a GET?

### The Unexpected Decision

The Merkle verifier uses `useMutation` (normally for writes) to call a GET endpoint:

```javascript
const verifyMutation = useMutation({
  mutationFn: (block) => api.get(`/audit/verify-merkle/${block}`).then(r => r.data),
  onSuccess:  (data)  => setResult(data),
})
```

**Why not `useQuery`?**

`useQuery` has automatic behaviors:
- Refetch on window focus (user switches tabs and comes back → re-runs the query)
- Refetch on reconnect (user goes offline and back online → re-runs)
- Background refetch when stale time expires

For a Merkle verification, none of these behaviors are appropriate:
- The result should only appear after an explicit "Verify" button click
- Automatic refetching would overwrite the result without the user asking
- The verification is stateful (it logs to `audit_log`) — re-running it on focus
  would create duplicate audit trail entries

`useMutation` has none of these automatic behaviors. It only runs when you
explicitly call `mutation.mutate(blockNumber)`. The result stays displayed until
the user verifies a different block or navigates away.

**The rule:** Use `useQuery` for data you want to keep fresh automatically. Use
`useMutation` for operations that should only run on explicit user action — even if
the operation is technically a read.

---

## Part 14 — Build Analysis and What It Tells Us

### The Final Bundle Breakdown

```
LoanRequestPage.js    88.42 KB  ← zod + react-hook-form pulled in here
KYCPage.js            65.48 KB  ← react-dropzone pulled in here
PageLayout.js         22.15 kB  ← date-fns (used by formatters)
formatters.js         23.05 kB  ← date-fns
useQuery.js           10.55 kB  ← React Query split out automatically
ethers.js            272.64 kB  ← shared by all tx pages
vendor.js            160.14 kB  ← React + Router + React Query core
index.js             100.26 kB  ← app shell + contexts + route guards
```

### Why Is `LoanRequestPage` 88 KB?

The loan request page imports `react-hook-form` and `@hookform/resolvers/zod` and `zod`.
These are the validation libraries. Because `LoanRequestPage` is the only page that
uses them in Phase 10, Vite bundles them exclusively into this chunk. If later pages
also used react-hook-form, Vite's tree-shaking would automatically extract the shared
library into a separate chunk.

### Why Is `ethers.js` 272 KB?

Ethers v6 is a large library. It includes:
- ECDSA key operations
- ABI encoding/decoding
- RLP encoding (Ethereum wire format)
- ENS (Ethereum Name Service)
- Multiple provider implementations

Many of these features (ENS, hardware wallet providers) are never used by EDL. A future
optimisation would be to import only the specific ethers submodules we need
(`ethers/providers`, `ethers/contract`, `ethers/utils`) rather than the full library.

The important point is that at 272 KB, `ethers` is only downloaded when the user
navigates to a page that calls the blockchain (LoanRequestPage, RepaymentPage,
LenderDashboard). The login page and borrower dashboard do not trigger this download.

---

## Part 15 — Phase 10 by the Numbers

| Metric | Value |
|---|---|
| Source files written | 36 |
| Build chunks (code-split) | 19 |
| Build errors | 0 |
| Pages implemented | 10 of 11 (CreditPassport is a stub) |
| User roles covered | 4 (entrepreneur, lender, officer, regulator) |
| Vitest unit tests | 28 passing |
| Bugs caught and fixed | 5 |
| Total frontend lines of code | ~6,900 insertions |
| Initial bundle size (gzip) | ~135 KB (index + vendor) |
| Dev server start time | 696 ms |

---

## Part 16 — What Comes Next (M13: Integration Testing)

Phase 10 built all the UI. Phase 11 (M13) will test whether the full system works
end-to-end with real data:

1. **Start Ganache** — local blockchain with deterministic accounts
2. **Start Laravel** — `php artisan serve`
3. **Start Vite** — `npm run dev`
4. **Run the 5 dissertation validation scenarios:**
   - Scenario 1: Entrepreneur registers, uploads KYC, officer verifies → can request loan
   - Scenario 2: Loan created on-chain, lender funds, automatic disbursement
   - Scenario 3: Borrower makes repayment, credit score updates, history visible
   - Scenario 4: 90-day default → automatic CEMAC blacklisting via event listener
   - Scenario 5: Regulator accesses full ledger without institution cooperation

5. **Write Playwright E2E tests** that automate these scenarios

The deferred item is the **CreditPassport** page — cross-institution credit history with
consent flow. This requires the `grantLenderAccess()` / `revokeLenderAccess()` on-chain
flow to be wired up end-to-end, which will be done during M13.

---

## Summary for Your Dissertation

Here is how to describe Phase 10 in Chapter 4 (Implementation):

> The frontend was implemented as a React 18 SPA with Vite as the build tool.
> The architecture uses a layered provider stack (BrowserRouter → TanStack Query →
> WalletProvider → AuthProvider) to separate concerns: blockchain wallet state (MetaMask),
> authentication state (Laravel Sanctum), and server data caching (React Query) each have
> independent lifecycles managed by dedicated context providers.
>
> Wallet authentication implements a challenge-response protocol (nonce → ECDSA sign →
> ecrecover verify) eliminating password storage entirely. Role-based access control is
> enforced at the route level through composable guard components (RequireAuth,
> RequireRole, RequireKYC). All pages are lazy-loaded with React.lazy() and Suspense,
> reducing the initial bundle by 85% versus a non-split equivalent.
>
> Direct contract interaction is handled through ethers.js v6 BrowserProvider, using
> minimal human-readable ABI fragments to minimise bundle size. TanStack Query manages
> data caching with automatic invalidation on mutation success, creating a reactive UI
> where repayment actions update the credit score gauge without page reload.

---

*End of Engineering Journal — Phase 10*  
*Total frontend milestones: M9 ✅ M10 ✅ M11 ✅ M12 ✅*  
*Next: M13 — Integration Testing & Dissertation Validation Scenarios*
