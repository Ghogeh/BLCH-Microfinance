import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import api from '@/lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null)
  const [token, setToken]       = useState(() => localStorage.getItem('edl_token'))
  const [isLoading, setIsLoading] = useState(Boolean(localStorage.getItem('edl_token')))

  // Rehydrate user from stored token on mount
  useEffect(() => {
    if (!token) { setIsLoading(false); return }
    api.get('/users/me')
      .then((r) => setUser(r.data.data ?? r.data))
      .catch(() => {
        localStorage.removeItem('edl_token')
        setToken(null)
      })
      .finally(() => setIsLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (wallet, signMessage) => {
    // 1. Request nonce from Laravel
    const { data: nonceData } = await api.get(`/auth/nonce?wallet=${wallet}`)
    const nonce = nonceData.nonce ?? nonceData.data?.nonce

    // 2. Ask MetaMask to sign it (user sees the MetaMask popup here)
    const signature = await signMessage(nonce)

    // 3. Submit signature — Laravel calls ecrecover, issues Sanctum token
    const { data } = await api.post('/auth/verify', { wallet, signature })
    const newToken = data.token ?? data.data?.token
    const newUser  = data.user  ?? data.data?.user

    localStorage.setItem('edl_token', newToken)
    setToken(newToken)
    setUser(newUser)
    return newUser
  }, [])

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout') } catch (_) { /* token may already be invalid */ }
    localStorage.removeItem('edl_token')
    setToken(null)
    setUser(null)
  }, [])

  const isAuthenticated = Boolean(token && user)

  return (
    <AuthContext.Provider value={{ user, token, isLoading, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
