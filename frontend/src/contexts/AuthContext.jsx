import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useWallet } from './WalletContext'
import api from '../utils/apiClient'
import toast from 'react-hot-toast'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const { address, signer, isConnected } = useWallet()
  const [user, setUser]                 = useState(null)
  const [token, setToken]               = useState(() => localStorage.getItem('edl_token'))
  const [isLoading, setIsLoading]       = useState(false)
  const [isAuthenticating, setIsAuthenticating] = useState(false)

  // Rehydrate user from localStorage on mount (avoids flash before API responds)
  useEffect(() => {
    const stored = localStorage.getItem('edl_user')
    if (stored && token) {
      try { setUser(JSON.parse(stored)) } catch { /* ignore parse errors */ }
    }
  }, [])

  // Fetch fresh user profile from API whenever token changes
  useEffect(() => {
    if (!token) return
    setIsLoading(true)
    api.get('/users/me')
      .then(({ data }) => {
        setUser(data.user)
        localStorage.setItem('edl_user', JSON.stringify(data.user))
      })
      .catch(() => logout())
      .finally(() => setIsLoading(false))
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Three-step wallet login:
   * 1. GET  /auth/nonce  → receive challenge message
   * 2. Sign with MetaMask → proves wallet ownership without sharing private key
   * 3. POST /auth/verify  → Laravel ecrecover, returns Sanctum token
   */
  const login = useCallback(async () => {
    if (!isConnected || !address || !signer) {
      toast.error('Connect your wallet first.')
      return
    }

    setIsAuthenticating(true)
    try {
      const { data: nonceData } = await api.get(`/auth/nonce?wallet=${address}`)
      const signature = await signer.signMessage(nonceData.message)
      const { data: authData } = await api.post('/auth/verify', { wallet: address, signature })

      localStorage.setItem('edl_token', authData.token)
      localStorage.setItem('edl_user', JSON.stringify(authData.user))
      setToken(authData.token)
      setUser(authData.user)

      toast.success(`Welcome back, ${authData.user.name || formatAddress(address)}!`)
      return authData.user
    } catch (error) {
      if (error.code === 4001) {
        toast.error('Signing rejected. Authentication cancelled.')
      } else {
        const msg = error.response?.data?.error || error.message
        toast.error(`Authentication failed: ${msg}`)
      }
      throw error
    } finally {
      setIsAuthenticating(false)
    }
  }, [address, signer, isConnected])

  const logout = useCallback(async () => {
    try {
      if (token) await api.post('/auth/logout').catch(() => {})
    } finally {
      localStorage.removeItem('edl_token')
      localStorage.removeItem('edl_user')
      setToken(null)
      setUser(null)
      toast.success('Logged out.')
    }
  }, [token])

  const updateProfile = useCallback(async (profileData) => {
    const { data } = await api.put('/auth/register', profileData)
    setUser(data.user)
    localStorage.setItem('edl_user', JSON.stringify(data.user))
    return data.user
  }, [])

  const value = {
    user,
    token,
    isLoading,
    isAuthenticating,
    isAuthenticated:  Boolean(token && user),
    login,
    logout,
    updateProfile,
    isEntrepreneur: user?.role === 'entrepreneur',
    isLender:       user?.role === 'lender',
    isOfficer:      user?.role === 'officer',
    isRegulator:    user?.role === 'regulator',
    isAdmin:        user?.role === 'admin',
    isKYCVerified:  user?.kyc_status === 'verified',
    isBlacklisted:  user?.blacklisted === true,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}

function formatAddress(addr) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : ''
}
