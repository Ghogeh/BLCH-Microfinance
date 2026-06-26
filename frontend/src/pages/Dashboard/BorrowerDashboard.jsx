import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import PageLayout from '../../components/shared/PageLayout'
import LoanStateBadge from '../../components/shared/LoanStateBadge'
import CreditScoreGauge from '../../components/shared/CreditScoreGauge'
import DataTable from '../../components/shared/DataTable'
import { useAuth } from '../../hooks/useAuth'
import api from '../../utils/apiClient'
import { formatCFA, formatDate, timeAgo } from '../../utils/formatters'
import toast from 'react-hot-toast'

export default function BorrowerDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const { data: loansData, isLoading: loansLoading } = useQuery({
    queryKey: ['my-loans'],
    queryFn:  () => api.get('/loans').then(r => r.data),
  })

  const { data: scoreData } = useQuery({
    queryKey: ['credit-score'],
    queryFn:  () => api.get('/users/me/credit-score').then(r => r.data),
  })

  const loans       = loansData?.data || []
  const activeLoan  = loans.find(l => l.state === 'ACTIVE')
  const creditScore = scoreData?.score ?? user?.creditScore?.score ?? 50

  const stats = [
    { label: 'Total Loans', value: loans.length },
    { label: 'Active',      value: loans.filter(l => l.state === 'ACTIVE').length },
    { label: 'Repaid',      value: loans.filter(l => l.state === 'REPAID').length },
    { label: 'Defaulted',   value: loans.filter(l => l.state === 'DEFAULTED').length },
  ]

  const loanColumns = [
    { key: 'id',          label: '#',         render: v => `#${v}` },
    { key: 'amount_cfa',  label: 'Amount',    render: v => formatCFA(v) },
    { key: 'state',       label: 'Status',    render: v => <LoanStateBadge state={v} /> },
    { key: 'due_date',    label: 'Due Date',  render: v => formatDate(v) },
    { key: 'remaining_balance_cfa', label: 'Remaining', render: v => formatCFA(v) },
    {
      key: '_actions',
      label: '',
      render: (_, row) => (
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/loans/${row.id}`)}
            className="text-xs text-blue-600 hover:underline"
          >
            View
          </button>
          {row.state === 'ACTIVE' && (
            <button
              onClick={() => navigate(`/loans/${row.id}/repay`)}
              className="text-xs text-emerald-600 hover:underline"
            >
              Repay
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <PageLayout title="My Dashboard">

      {/* Credit score + active loan */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

        <div className="bg-white rounded-xl border border-gray-100 p-6 flex flex-col items-center gap-3">
          <p className="text-sm font-medium text-gray-500">Credit Score</p>
          <CreditScoreGauge score={creditScore} size="lg" />
          <button
            onClick={() => navigate('/loans/new')}
            className="w-full mt-2 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            + Request New Loan
          </button>
        </div>

        <div className="md:col-span-2 bg-white rounded-xl border border-gray-100 p-6">
          {activeLoan ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-gray-500">Active Loan</h2>
                <LoanStateBadge state={activeLoan.state} />
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-400">Loan Amount</p>
                  <p className="text-lg font-semibold">{formatCFA(activeLoan.amount_cfa)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Remaining Balance</p>
                  <p className="text-lg font-semibold text-amber-600">
                    {formatCFA(activeLoan.remaining_balance_cfa)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Due Date</p>
                  <p className="text-sm font-medium">{formatDate(activeLoan.due_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Repayment Progress</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-emerald-500 h-2 rounded-full transition-all"
                        style={{
                          width: `${Math.max(0, (
                            (activeLoan.amount_cfa - activeLoan.remaining_balance_cfa) /
                            (activeLoan.amount_cfa * 1.1)
                          ) * 100).toFixed(0)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => navigate(`/loans/${activeLoan.id}/repay`)}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  Make Repayment
                </button>
                <button
                  onClick={() => navigate(`/loans/${activeLoan.id}`)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50"
                >
                  Details
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-8 text-center">
              <p className="text-gray-400 text-sm mb-3">No active loan</p>
              <button
                onClick={() => navigate('/loans/new')}
                className="py-2 px-4 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700"
              >
                Apply for a loan
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {stats.map(stat => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">{stat.label}</p>
            <p className="text-2xl font-semibold mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* All loans table */}
      <div className="bg-white rounded-xl border border-gray-100">
        <div className="px-4 py-3 border-b border-gray-50">
          <h2 className="text-sm font-medium text-gray-900">All Loans</h2>
        </div>
        <DataTable
          columns={loanColumns}
          rows={loans}
          isLoading={loansLoading}
          emptyMessage="No loans yet. Click 'Request New Loan' to get started."
        />
      </div>

    </PageLayout>
  )
}
