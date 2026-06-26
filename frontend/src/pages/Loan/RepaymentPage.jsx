import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ethers } from 'ethers'
import PageLayout from '../../components/shared/PageLayout'
import LoanStateBadge from '../../components/shared/LoanStateBadge'
import { useWallet } from '../../hooks/useWallet'
import api from '../../utils/apiClient'
import { formatCFA, formatDate, timeAgo, formatTxHash } from '../../utils/formatters'
import { LOAN_CONTRACT_ABI } from '../../utils/contractABI'
import toast from 'react-hot-toast'

export default function RepaymentPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const qClient  = useQueryClient()
  const { getContract, isCorrectNetwork } = useWallet()
  const [amount, setAmount]     = useState('')
  const [txStatus, setTxStatus] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['loan', id],
    queryFn:  () => api.get(`/loans/${id}`).then(r => r.data),
  })

  const loan = data?.loan

  const repayMutation = useMutation({
    mutationFn: async (amountCFA) => {
      if (!isCorrectNetwork) throw new Error('Switch to EDL network first.')
      setTxStatus('Preparing repayment transaction…')

      const loanContract = getContract(loan.contract_address, LOAN_CONTRACT_ABI)
      const amountWei    = ethers.parseUnits(String(amountCFA), 'wei')

      setTxStatus('Waiting for MetaMask confirmation…')
      const tx = await loanContract.repay({ value: amountWei })

      setTxStatus('Confirming on blockchain…')
      await tx.wait()

      setTxStatus('Syncing with server…')
      await api.post(`/loans/${id}/repay`, { amount_cfa: amountCFA })

      return tx.hash
    },
    onSuccess: (txHash) => {
      qClient.invalidateQueries({ queryKey: ['loan', id] })
      qClient.invalidateQueries({ queryKey: ['my-loans'] })
      qClient.invalidateQueries({ queryKey: ['credit-score'] })
      toast.success(`Repayment confirmed! Tx: ${formatTxHash(txHash)}`)
      setAmount('')
    },
    onError: (error) => {
      if (error.code === 4001) toast.error('Repayment rejected in MetaMask.')
      else toast.error(`Repayment failed: ${error.message}`)
    },
    onSettled: () => setTxStatus(null),
  })

  if (isLoading || !loan) {
    return (
      <PageLayout>
        <div className="animate-pulse h-48 bg-gray-100 rounded-xl" />
      </PageLayout>
    )
  }

  const progressPct = Math.max(0,
    ((loan.amount_cfa - loan.remaining_balance_cfa) / (loan.amount_cfa * 1.1)) * 100
  )

  return (
    <PageLayout title="Make a Repayment">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Loan summary */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium">Loan #{loan.id}</p>
            <LoanStateBadge state={loan.state} />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total Repayable</span>
              <span className="font-medium">{formatCFA(loan.amount_cfa * 1.1)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Remaining Balance</span>
              <span className="font-semibold text-amber-600">
                {formatCFA(loan.remaining_balance_cfa)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Due Date</span>
              <span className={
                loan.due_date && new Date(loan.due_date) < new Date()
                  ? 'font-medium text-red-600'
                  : 'font-medium'
              }>
                {formatDate(loan.due_date)}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Repayment progress</span>
              <span>{progressPct.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Repayment form or closed state */}
        {loan.state === 'ACTIVE' ? (
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <label className="block text-sm font-medium mb-2">Amount to Repay (CFA)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              max={loan.remaining_balance_cfa}
              placeholder={`Max: ${formatCFA(loan.remaining_balance_cfa)}`}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />

            {/* Quick-select percentages */}
            <div className="flex gap-2 mb-4 mt-2">
              {[25, 50, 100].map(pct => (
                <button
                  key={pct}
                  onClick={() =>
                    setAmount(((loan.remaining_balance_cfa * pct) / 100).toFixed(0))
                  }
                  className="text-xs px-2.5 py-1 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  {pct}%
                </button>
              ))}
            </div>

            {txStatus && (
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl mb-3">
                <div className="animate-spin h-4 w-4 border-b-2 border-emerald-600 rounded-full flex-shrink-0" />
                <p className="text-xs text-gray-600">{txStatus}</p>
              </div>
            )}

            <button
              onClick={() => repayMutation.mutate(parseFloat(amount))}
              disabled={!amount || repayMutation.isPending || !!txStatus}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium rounded-xl"
            >
              {repayMutation.isPending ? 'Processing…' : 'Confirm Repayment'}
            </button>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl border border-gray-100 p-5 text-center">
            <p className="text-gray-500 text-sm">
              This loan is <strong>{loan.state.toLowerCase()}</strong> — no further repayments accepted.
            </p>
          </div>
        )}

        {/* Repayment history */}
        {loan.repayments?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100">
            <div className="px-4 py-3 border-b border-gray-50">
              <h3 className="text-sm font-medium">Repayment History</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {loan.repayments.map((r, i) => (
                <div key={i} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{formatCFA(r.amount_paid_cfa)}</p>
                    <p className="text-xs text-gray-400">{timeAgo(r.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Remaining after</p>
                    <p className="text-sm">{formatCFA(r.remaining_after_cfa)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </PageLayout>
  )
}
