import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useWallet } from '../../hooks/useWallet'
import { useAuth } from '../../hooks/useAuth'
import { ROLE_CONFIG } from '../../utils/loanConfig'
import { formatAddress } from '../../utils/formatters'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { connect, isConnected, address, isConnecting, isCorrectNetwork } = useWallet()
  const { login, isAuthenticated, user, isAuthenticating } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()

  // Redirect after login based on user role
  useEffect(() => {
    if (isAuthenticated && user) {
      const from     = location.state?.from?.pathname
      const roleHome = ROLE_CONFIG[user.role]?.home || '/dashboard'
      navigate(from || roleHome, { replace: true })
    }
  }, [isAuthenticated, user]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = async () => {
    if (!isConnected) {
      await connect()
      return
    }
    if (!isCorrectNetwork) {
      toast.error('Please switch to the EDL network in MetaMask first.')
      return
    }
    try {
      await login()
    } catch {
      // Error already handled inside AuthContext
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">EDL</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Entrepreneurial Decentralised Ledger
          </h1>
          <p className="text-gray-500 mt-2 text-sm">
            Blockchain microfinance for unbanked entrepreneurs
          </p>
        </div>

        {/* Login card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

          {/* Wallet status indicator */}
          <div className="mb-6">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                isConnected && isCorrectNetwork
                  ? 'bg-emerald-500'
                  : isConnected
                  ? 'bg-amber-500'
                  : 'bg-gray-300'
              }`} />
              <div className="flex-1 min-w-0">
                {isConnected ? (
                  <>
                    <p className="text-sm font-medium text-gray-900">
                      {formatAddress(address)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {isCorrectNetwork
                        ? 'Connected to EDL network'
                        : 'Wrong network — please switch'}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">No wallet connected</p>
                )}
              </div>
            </div>
          </div>

          {/* Action button */}
          <button
            onClick={handleLogin}
            disabled={isConnecting || isAuthenticating}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
          >
            {isConnecting      ? 'Connecting wallet…'  :
             isAuthenticating  ? 'Signing message…'    :
             !isConnected      ? 'Connect MetaMask'    :
             !isCorrectNetwork ? 'Switch Network First' :
                                 'Sign In'}
          </button>

          {/* Step-by-step help */}
          <div className="mt-6 space-y-3">
            {[
              'Install MetaMask and connect your wallet',
              'Sign a message to prove wallet ownership — no password needed',
              'Access your role-based dashboard',
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-blue-500 text-lg mt-0.5 font-medium">{i + 1}</span>
                <p className="text-sm text-gray-600">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          University of Bamenda · NAHPI · MSc Computer Engineering
        </p>
      </div>
    </div>
  )
}
