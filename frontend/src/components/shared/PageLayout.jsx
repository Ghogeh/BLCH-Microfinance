import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useWallet } from '../../hooks/useWallet'
import { ROLE_CONFIG } from '../../utils/loanConfig'
import { formatAddress } from '../../utils/formatters'
import { cn } from '../../utils/cn'

export default function PageLayout({ children, title }) {
  const { user, logout, isEntrepreneur, isLender, isOfficer, isRegulator } = useAuth()
  const { address } = useWallet()
  const navigate = useNavigate()

  const navLinks = [
    ...(isEntrepreneur ? [
      { label: 'Dashboard', path: '/dashboard' },
      { label: 'New Loan',  path: '/loans/new' },
    ] : []),
    ...(isLender ? [
      { label: 'Marketplace', path: '/lender' },
    ] : []),
    ...(isOfficer ? [
      { label: 'KYC Queue', path: '/officer' },
    ] : []),
    ...(isRegulator ? [
      { label: 'Audit', path: '/audit' },
    ] : []),
  ]

  const roleConf = ROLE_CONFIG[user?.role] || {}

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">

          <div className="flex items-center gap-6">
            <button
              onClick={() => navigate(roleConf.home || '/dashboard')}
              className="flex items-center gap-2"
            >
              <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-xs font-bold">EDL</span>
              </div>
              <span className="text-sm font-semibold text-gray-900 hidden sm:block">
                Microfinance
              </span>
            </button>

            <nav className="flex items-center gap-1">
              {navLinks.map(link => (
                <button
                  key={link.path}
                  onClick={() => navigate(link.path)}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  {link.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2">
                <span className={cn(
                  'text-xs font-medium px-2 py-0.5 rounded-full',
                  roleConf.bg, roleConf.color
                )}>
                  {roleConf.label}
                </span>
                <span className="text-xs text-gray-400 hidden sm:block font-mono">
                  {formatAddress(address)}
                </span>
              </div>
            )}
            <button
              onClick={logout}
              className="text-xs text-gray-500 hover:text-gray-900 px-2 py-1 rounded"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {title && (
          <h1 className="text-xl font-semibold text-gray-900 mb-6">{title}</h1>
        )}
        {children}
      </main>
    </div>
  )
}
