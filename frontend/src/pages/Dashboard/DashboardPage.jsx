import { useAuth } from '@contexts/AuthContext'
import { useWalletContext } from '@contexts/WalletContext'

const ROLE_LABELS = {
  entrepreneur: 'Entrepreneur',
  lender:       'Lender',
  officer:      'MFI Officer',
  regulator:    'Regulator (COBAC)',
  guarantor:    'Guarantor',
  admin:        'Administrator',
}

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const { account, disconnect } = useWalletContext()

  const handleLogout = async () => {
    await logout()
    disconnect()
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <h1 className="mb-1 text-xl font-bold text-white">EDL Dashboard</h1>
        <p className="mb-6 text-xs text-slate-500">Wallet authenticated via MetaMask</p>

        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-400">Name</dt>
            <dd className="font-medium text-white">{user?.name ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-400">Role</dt>
            <dd className="font-mono text-emerald-400">{ROLE_LABELS[user?.role] ?? user?.role}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-400">KYC status</dt>
            <dd className={user?.kyc_status === 'verified' ? 'text-emerald-400' : 'text-yellow-400'}>
              {user?.kyc_status}
            </dd>
          </div>
          {account && (
            <div className="flex justify-between">
              <dt className="text-slate-400">Wallet</dt>
              <dd className="max-w-[220px] truncate font-mono text-xs text-slate-300">{account}</dd>
            </div>
          )}
        </dl>

        <p className="mt-6 text-center text-xs text-slate-500">
          M10–M12 dashboards will replace this stub.
        </p>

        <button
          onClick={handleLogout}
          className="mt-6 w-full rounded-xl bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600"
        >
          Disconnect
        </button>
      </div>
    </div>
  )
}
