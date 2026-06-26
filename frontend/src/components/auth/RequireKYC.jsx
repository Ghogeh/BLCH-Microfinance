import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export default function RequireKYC({ children }) {
  const { user } = useAuth()

  if (!user) return <Navigate to="/login" replace />

  if (user.kyc_status !== 'verified') {
    return <Navigate to="/kyc" replace />
  }

  return children
}
