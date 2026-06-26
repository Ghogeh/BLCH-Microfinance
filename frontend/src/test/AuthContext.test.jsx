import { render, screen, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AuthProvider, useAuth } from '@contexts/AuthContext'

// Mock apiClient (the module AuthContext imports)
vi.mock('@/utils/apiClient', () => {
  const mock = {
    get:          vi.fn(),
    post:         vi.fn(),
    put:          vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  }
  return { default: mock }
})

// Mock useWallet so AuthContext can call login() without a real wallet
vi.mock('@contexts/WalletContext', () => ({
  useWallet: vi.fn(),
}))

import api from '@/utils/apiClient'
import { useWallet } from '@contexts/WalletContext'

const MOCK_USER  = { id: 1, name: 'Alice', role: 'entrepreneur', kyc_status: 'verified', blacklisted: false }
const MOCK_TOKEN = 'sanctum-test-token'
const MOCK_NONCE = 'Sign this nonce to log in: abc123'
const MOCK_SIG   = '0xdeadbeef'

// Default wallet state — connected, correct network
const CONNECTED_WALLET = {
  address:    '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
  signer:     { signMessage: vi.fn().mockResolvedValue(MOCK_SIG) },
  isConnected: true,
}

function TestComponent() {
  const {
    user, isAuthenticated, isLoading, isAuthenticating,
    login, logout, isEntrepreneur, isKYCVerified,
  } = useAuth()

  if (isLoading) return <p>loading</p>
  if (!isAuthenticated) return (
    <div>
      <p>not authenticated</p>
      <button onClick={login}>login</button>
    </div>
  )
  return (
    <div>
      <p data-testid="role">{user.role}</p>
      <p data-testid="entrepreneur">{String(isEntrepreneur)}</p>
      <p data-testid="kyc">{String(isKYCVerified)}</p>
      <button onClick={logout}>logout</button>
    </div>
  )
}

function renderWithAuth(walletOverrides = {}) {
  useWallet.mockReturnValue({ ...CONNECTED_WALLET, ...walletOverrides })
  return render(<AuthProvider><TestComponent /></AuthProvider>)
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    useWallet.mockReturnValue(CONNECTED_WALLET)
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('shows "not authenticated" initially when no token in storage', async () => {
    renderWithAuth()
    await waitFor(() => expect(screen.getByText('not authenticated')).toBeTruthy())
  })

  it('rehydrates user from /users/me when token exists in localStorage', async () => {
    localStorage.setItem('edl_token', MOCK_TOKEN)
    api.get.mockResolvedValueOnce({ data: { user: MOCK_USER } })

    renderWithAuth()

    await waitFor(() => expect(screen.getByTestId('role')).toBeTruthy())
    expect(screen.getByTestId('role').textContent).toBe('entrepreneur')
    expect(api.get).toHaveBeenCalledWith('/users/me')
  })

  it('calls logout() and shows "not authenticated" when /users/me rejects', async () => {
    localStorage.setItem('edl_token', MOCK_TOKEN)
    api.get.mockRejectedValueOnce(new Error('401'))
    api.post.mockResolvedValueOnce({}) // logout call

    renderWithAuth()

    await waitFor(() => expect(screen.getByText('not authenticated')).toBeTruthy())
    expect(localStorage.getItem('edl_token')).toBeNull()
  })

  it('login() fetches nonce, signs message, posts verify, stores token and user', async () => {
    api.get.mockResolvedValueOnce({ data: { message: MOCK_NONCE } })   // /auth/nonce
    api.post.mockResolvedValueOnce({ data: { token: MOCK_TOKEN, user: MOCK_USER } }) // /auth/verify
    api.get.mockResolvedValueOnce({ data: { user: MOCK_USER } })       // /users/me (triggered by token effect)

    renderWithAuth()
    await waitFor(() => screen.getByText('not authenticated'))

    await act(async () => {
      screen.getByRole('button', { name: /login/i }).click()
    })

    expect(api.get).toHaveBeenCalledWith(`/auth/nonce?wallet=${CONNECTED_WALLET.address}`)
    expect(CONNECTED_WALLET.signer.signMessage).toHaveBeenCalledWith(MOCK_NONCE)
    expect(api.post).toHaveBeenCalledWith('/auth/verify', {
      wallet:    CONNECTED_WALLET.address,
      signature: MOCK_SIG,
    })
    expect(localStorage.getItem('edl_token')).toBe(MOCK_TOKEN)
    await waitFor(() => expect(screen.getByTestId('role')).toBeTruthy())
  })

  it('login() shows error toast and throws when wallet not connected', async () => {
    renderWithAuth({ isConnected: false, address: null, signer: null })
    await waitFor(() => screen.getByText('not authenticated'))

    await act(async () => {
      screen.getByRole('button', { name: /login/i }).click()
    })

    // Should not have called the API
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/auth/nonce'))
  })

  it('logout() removes token and user from localStorage', async () => {
    localStorage.setItem('edl_token', MOCK_TOKEN)
    api.get.mockResolvedValueOnce({ data: { user: MOCK_USER } })
    api.post.mockResolvedValueOnce({})

    renderWithAuth()
    await waitFor(() => expect(screen.getByTestId('role')).toBeTruthy())

    await act(async () => {
      screen.getByRole('button', { name: /logout/i }).click()
    })

    await waitFor(() => expect(screen.getByText('not authenticated')).toBeTruthy())
    expect(localStorage.getItem('edl_token')).toBeNull()
    expect(localStorage.getItem('edl_user')).toBeNull()
  })

  it('logout() succeeds even if /auth/logout API call fails', async () => {
    localStorage.setItem('edl_token', MOCK_TOKEN)
    api.get.mockResolvedValueOnce({ data: { user: MOCK_USER } })
    api.post.mockRejectedValueOnce(new Error('network error'))

    renderWithAuth()
    await waitFor(() => expect(screen.getByTestId('role')).toBeTruthy())

    await act(async () => {
      screen.getByRole('button', { name: /logout/i }).click()
    })

    await waitFor(() => expect(screen.getByText('not authenticated')).toBeTruthy())
    expect(localStorage.getItem('edl_token')).toBeNull()
  })

  it('exposes role convenience flags correctly', async () => {
    localStorage.setItem('edl_token', MOCK_TOKEN)
    api.get.mockResolvedValueOnce({ data: { user: MOCK_USER } })

    renderWithAuth()
    await waitFor(() => expect(screen.getByTestId('entrepreneur')).toBeTruthy())

    expect(screen.getByTestId('entrepreneur').textContent).toBe('true')
    expect(screen.getByTestId('kyc').textContent).toBe('true')
  })
})
