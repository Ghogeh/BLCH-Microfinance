import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { RoleGuard } from '@/components/guards/RoleGuard'

// Mock AuthContext so we can control auth state without a real provider
vi.mock('@contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '@contexts/AuthContext'

function Protected({ roles, requireKyc }) {
  return (
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route path="/login" element={<p>login page</p>} />
        <Route path="/kyc"   element={<p>kyc page</p>} />
        <Route
          path="/protected"
          element={
            <RoleGuard roles={roles} requireKyc={requireKyc}>
              <p>protected content</p>
            </RoleGuard>
          }
        />
      </Routes>
    </MemoryRouter>
  )
}

describe('RoleGuard', () => {
  it('shows loading indicator while auth is resolving', () => {
    useAuth.mockReturnValue({ isLoading: true, isAuthenticated: false, user: null })
    render(<Protected />)
    expect(screen.getByText(/loading/i)).toBeTruthy()
  })

  it('redirects to /login when user is not authenticated', () => {
    useAuth.mockReturnValue({ isLoading: false, isAuthenticated: false, user: null })
    render(<Protected />)
    expect(screen.getByText('login page')).toBeTruthy()
    expect(screen.queryByText('protected content')).toBeNull()
  })

  it('renders children when authenticated with no role restriction', () => {
    useAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: { role: 'entrepreneur', kyc_status: 'verified' },
    })
    render(<Protected />)
    expect(screen.getByText('protected content')).toBeTruthy()
  })

  it('renders children when authenticated user role matches required role', () => {
    useAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: { role: 'lender', kyc_status: 'verified' },
    })
    render(<Protected roles={['lender']} />)
    expect(screen.getByText('protected content')).toBeTruthy()
  })

  it('shows Access Denied when authenticated user role does not match', () => {
    useAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: { role: 'entrepreneur', kyc_status: 'verified' },
    })
    render(<Protected roles={['regulator']} />)
    expect(screen.getByText(/access denied/i)).toBeTruthy()
    expect(screen.queryByText('protected content')).toBeNull()
  })

  it('shows correct required role in the Access Denied message', () => {
    useAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: { role: 'lender', kyc_status: 'verified' },
    })
    render(<Protected roles={['officer', 'admin']} />)
    expect(screen.getByText(/officer or admin/i)).toBeTruthy()
  })

  it('redirects to /kyc when requireKyc=true and kyc_status is pending', () => {
    useAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: { role: 'entrepreneur', kyc_status: 'pending' },
    })
    render(<Protected requireKyc={true} />)
    expect(screen.getByText('kyc page')).toBeTruthy()
    expect(screen.queryByText('protected content')).toBeNull()
  })

  it('renders children when requireKyc=true and kyc_status is verified', () => {
    useAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: { role: 'entrepreneur', kyc_status: 'verified' },
    })
    render(<Protected requireKyc={true} />)
    expect(screen.getByText('protected content')).toBeTruthy()
  })
})
