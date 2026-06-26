import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ethers } from 'ethers'
import PageLayout from '../../components/shared/PageLayout'
import LoanStateBadge from '../../components/shared/LoanStateBadge'
import DataTable from '../../components/shared/DataTable'
import { useWallet } from '../../hooks/useWallet'
import api from '../../utils/apiClient'
import { formatCFA, formatDate, formatAddress } from '../../utils/formatters'
import { LOAN_CONTRACT_ABI } from '../../utils/contractABI'
import toast from 'react-hot-toast'

export default function LenderDashboard() {
  const navigate = useNavigate()
  const qClient  = useQueryClient()
  const { getContract, isCorrectNetwork } = useWallet()
  const [fundingLoanId, setFundingLoanId] = useState(null)
  const [fundAmount, setFundAmount]       = useState('')

  const { data: loansData, isLoading } = useQuery({
    queryKey: ['all-loans'],
    queryFn:  () => api.get('/loans').then(r => r.data),
  })

  const loans        = loansData?.data || []
  const fundingLoans = loans.filter(l => l.state === 'FUNDING')
  const activeLoans  = loans.filter(l => l.state === 'ACTIVE')

  const fundMutation = useMutation({
    mutationFn: async ({ loanId, contractAddress, amountCFA }) => {
      if (!isCorrectNetwork) throw new Error('Switch to EDL network first.')

      const loanContract = getContract(contractAddress, LOAN_CONTRACT_ABI)
      const amountWei    = ethers.parseUnits(String(amountCFA), 'wei')

      const tx = await loanContract.fund({ value: amountWei })
      await tx.wait()

      await api.post(`/loans/${loanId}/fund`, { amount_cfa: amountCFA })
      return { loanId }
    },
    onSuccess: () => {
      qClient.invalidateQueries({ queryKey: ['all-loans'] })
      toast.success('Loan funded on-chain!')
      setFundingLoanId(null)
      setFundAmount('')
    },
    onError: (error) => {
      if (error.code === 4001) toast.error('Transaction rejected.')
      else toast.error(`Funding failed: ${error.message}`)
    },
  })

  const portfolioStats = [
    { label: 'Opportunities',  value: fundingLoans.length },
    { label: 'Active Loans',   value: activeLoans.length },
    { label: 'Total Deployed', value: formatCFA(
        loans.reduce((s, l) => l.state === 'ACTIVE' ? s + parseFloat(l.amount_cfa) : s, 0)
      ),
    },
    { label: 'Repaid', value: loans.filter(l => l.state === 'REPAID').length },
  ]

  const loanColumns = [
    { key: 'id',         label: '#', render: v => `#${v}` },
    { key: 'borrower',   label: 'Borrower',
      render: (_, row) => formatAddress(row.borrower?.wallet_address) },
    { key: 'amount_cfa', label: 'Amount',  render: v => formatCFA(v) },
    { key: 'state',      label: 'Status',  render: v => <LoanStateBadge state={v} /> },
    { key: 'total_funded_cfa', label: 'Funded',
      render: (v, row) => (
        <div>
          <span className="font-medium">{formatCFA(v)}</span>
          <span className="text-xs text-gray-400 ml-1">
            ({row.amount_cfa > 0 ? ((v / row.amount_cfa) * 100).toFixed(0) : 0}%)
          </span>
        </div>
      ),
    },
    { key: 'due_date', label: 'Due', render: v => formatDate(v) },
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
          {row.state === 'FUNDING' && (
            <button
              onClick={() => setFundingLoanId(row.id)}
              className="text-xs text-emerald-600 hover:underline font-medium"
            >
              Fund
            </button>
          )}
        </div>
      ),
    },
  ]

  const selectedLoan = loans.find(l => l.id === fundingLoanId)

  return (
    <PageLayout title="Lender Dashboard">

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {portfolioStats.map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">{s.label}</p>
            <p className="text-xl font-semibold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Fund modal */}
      {fundingLoanId && selectedLoan && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold mb-1">Fund Loan #{fundingLoanId}</h3>
            <p className="text-sm text-gray-500 mb-4">
              Target: {formatCFA(selectedLoan.amount_cfa)} ·
              Funded: {formatCFA(selectedLoan.total_funded_cfa)}
            </p>

            <label className="block text-sm font-medium mb-1">Amount (CFA)</label>
            <input
              type="number"
              value={fundAmount}
              onChange={e => setFundAmount(e.target.value)}
              placeholder="Enter amount to fund"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />

            <div className="flex gap-2">
              <button
                onClick={() => fundMutation.mutate({
                  loanId:          fundingLoanId,
                  contractAddress: selectedLoan.contract_address,
                  amountCFA:       parseFloat(fundAmount),
                })}
                disabled={!fundAmount || fundMutation.isPending}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl"
              >
                {fundMutation.isPending ? 'Funding…' : 'Confirm Fund'}
              </button>
              <button
                onClick={() => { setFundingLoanId(null); setFundAmount('') }}
                className="px-4 py-2.5 border border-gray-200 text-sm rounded-xl hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Marketplace table */}
      <div className="bg-white rounded-xl border border-gray-100">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-medium">Loan Marketplace</h2>
          <span className="text-xs text-gray-400">
            {fundingLoans.length} funding {fundingLoans.length === 1 ? 'opportunity' : 'opportunities'}
          </span>
        </div>
        <DataTable
          columns={loanColumns}
          rows={loans}
          isLoading={isLoading}
          emptyMessage="No loans available."
        />
      </div>

    </PageLayout>
  )
}
