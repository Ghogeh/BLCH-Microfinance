import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { ROLE_CONFIG } from '../../utils/loanConfig'

export default function RequireRole({ role, children }) {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />
  }

  const allowed = Array.isArray(role) ? role : [role]
  if (!allowed.includes(user.role)) {
    const homeRoute = ROLE_CONFIG[user.role]?.home || '/dashboard'
    return <Navigate to={homeRoute} replace />
  }

  return children
}
