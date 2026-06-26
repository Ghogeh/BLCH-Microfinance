import { render, screen, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AuthProvider, useAuth } from '@contexts/AuthContext'

// Mock the api module so tests don't hit a real server
vi.mock('@/lib/api', () => {
  const mock = {
    get:  vi.fn(),
    post: vi.fn(),
    interceptors: { request: { use: vi.fn() } },
  }
  return { default: mock }
})

import api from '@/lib/api'

const MOCK_USER = { id: 1, name: 'Alice', role: 'entrepreneur', kyc_status: 'verified', wallet_address: '0xabc' }
const MOCK_TOKEN = 'sanctum-test-token'
const MOCK_NONCE = 'Sign this nonce: abc123'
const MOCK_SIG   = '0xdeadbeef'

function TestComponent() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth()
  if (isLoading) return <p>loading</p>
  if (!isAuthenticated) return <p>not authenticated</p>
  return (
    <div>
      <p data-testid="role">{user.role}</p>
      <button onClick={logout}>logout</button>
    </div>
  )
}

function renderWithAuth() {
  return render(<AuthProvider><TestComponent /></AuthProvider>)
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('shows "not authenticated" initially when no token in storage', async () => {
    renderWithAuth()
    await waitFor(() => expect(screen.getByText('not authenticated')).toBeTruthy())
  })

  it('rehydrates user from /users/me when a token exists in localStorage', async () => {
    localStorage.setItem('edl_token', MOCK_TOKEN)
    api.get.mockResolvedValueOnce({ data: { data: MOCK_USER } })

    renderWithAuth()

    await waitFor(() => expect(screen.getByTestId('role')).toBeTruthy())
    expect(screen.getByTestId('role').textContent).toBe('entrepreneur')
    expect(api.get).toHaveBeenCalledWith('/users/me')
  })

  it('clears token and shows "not authenticated" when /users/me rejects', async () => {
    localStorage.setItem('edl_token', MOCK_TOKEN)
    api.get.mockRejectedValueOnce(new Error('401'))

    renderWithAuth()

    await waitFor(() => expect(screen.getByText('not authenticated')).toBeTruthy())
    expect(localStorage.getItem('edl_token')).toBeNull()
  })

  it('login() fetches nonce, calls signMessage, posts verify, stores token', async () => {
    api.get.mockResolvedValueOnce({ data: { nonce: MOCK_NONCE } })
    api.post.mockResolvedValueOnce({ data: { token: MOCK_TOKEN, user: MOCK_USER } })

    let loginFn
    function Capturer() {
      const { login } = useAuth()
      loginFn = login
      return null
    }
    render(<AuthProvider><Capturer /><TestComponent /></AuthProvider>)
    await waitFor(() => screen.getByText('not authenticated'))

    const signMessage = vi.fn().mockResolvedValue(MOCK_SIG)
    await act(async () => {
      await loginFn('0xabc', signMessage)
    })

    expect(api.get).toHaveBeenCalledWith('/auth/nonce?wallet=0xabc')
    expect(signMessage).toHaveBeenCalledWith(MOCK_NONCE)
    expect(api.post).toHaveBeenCalledWith('/auth/verify', { wallet: '0xabc', signature: MOCK_SIG })
    expect(localStorage.getItem('edl_token')).toBe(MOCK_TOKEN)
    await waitFor(() => expect(screen.getByTestId('role')).toBeTruthy())
  })

  it('logout() removes token from localStorage and shows "not authenticated"', async () => {
    localStorage.setItem('edl_token', MOCK_TOKEN)
    api.get.mockResolvedValueOnce({ data: { data: MOCK_USER } })
    api.post.mockResolvedValueOnce({})

    renderWithAuth()
    await waitFor(() => expect(screen.getByTestId('role')).toBeTruthy())

    await act(async () => {
      screen.getByRole('button', { name: /logout/i }).click()
    })

    await waitFor(() => expect(screen.getByText('not authenticated')).toBeTruthy())
    expect(localStorage.getItem('edl_token')).toBeNull()
  })

  it('logout() succeeds even if the API call fails (token already invalid)', async () => {
    localStorage.setItem('edl_token', MOCK_TOKEN)
    api.get.mockResolvedValueOnce({ data: { data: MOCK_USER } })
    api.post.mockRejectedValueOnce(new Error('401'))

    renderWithAuth()
    await waitFor(() => expect(screen.getByTestId('role')).toBeTruthy())

    await act(async () => {
      screen.getByRole('button', { name: /logout/i }).click()
    })

    await waitFor(() => expect(screen.getByText('not authenticated')).toBeTruthy())
    expect(localStorage.getItem('edl_token')).toBeNull()
  })
})
