import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { useWallet } from '@hooks/useWallet'

export default function LoginPage() {
  const { login, isAuthenticating } = useAuth()
  const { address, connect, isConnecting, isConnected, isCorrectNetwork } = useWallet()

  const navigate = useNavigate()
  const location = useLocation()
  const from     = location.state?.from?.pathname ?? '/dashboard'

  const handleLogin = async () => {
    try {
      await login()
      navigate(from, { replace: true })
    } catch {
      // errors are toasted inside AuthContext.login — nothing more to do here
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white">EDL Microfinance</h1>
          <p className="mt-1 text-sm text-slate-400">Entrepreneurial Decentralised Ledger</p>
          <p className="mt-3 text-xs text-slate-500">No password — your wallet is your identity</p>
        </div>

        {isConnected && !isCorrectNetwork && (
          <div className="mb-4 rounded-lg bg-yellow-950/60 p-3 text-sm text-yellow-300">
            Wrong network. Switch MetaMask to Ganache (chain ID 1337).
          </div>
        )}

        {!isConnected ? (
          <button
            onClick={connect}
            disabled={isConnecting}
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {isConnecting ? 'Connecting…' : 'Connect MetaMask'}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-800 p-3">
              <p className="text-xs text-slate-400">Connected wallet</p>
              <p className="mt-1 truncate font-mono text-sm text-emerald-400">{address}</p>
            </div>
            <button
              onClick={handleLogin}
              disabled={isAuthenticating || !isCorrectNetwork}
              className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {isAuthenticating ? 'Signing…' : 'Sign in with MetaMask'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
