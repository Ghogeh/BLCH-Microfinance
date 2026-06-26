import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@contexts/AuthContext'

export function RoleGuard({ children, roles = [], requireKyc = false }) {
  const { user, isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">
        Loading…
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (roles.length > 0 && !roles.includes(user.role)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-950">
        <p className="text-lg font-semibold text-red-400">Access Denied</p>
        <p className="text-sm text-slate-400">
          Required role: <span className="font-mono text-white">{roles.join(' or ')}</span>
        </p>
        <p className="text-xs text-slate-500">
          Your role: <span className="font-mono">{user.role}</span>
        </p>
      </div>
    )
  }

  if (requireKyc && user.kyc_status !== 'verified') {
    return <Navigate to="/kyc" state={{ from: location }} replace />
  }

  return children
}
