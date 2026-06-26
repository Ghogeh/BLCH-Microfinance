import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import PageLayout from '../../components/shared/PageLayout'
import { useWallet } from '../../hooks/useWallet'
import { useAuth } from '../../hooks/useAuth'
import api from '../../utils/apiClient'
import { formatCFA } from '../../utils/formatters'
import toast from 'react-hot-toast'
import { LOAN_FACTORY_ABI } from '../../utils/contractABI'
import { ethers } from 'ethers'

const schema = z.object({
  amount_cfa: z.number()
    .min(50000,  'Minimum loan amount is CFA 50,000')
    .max(500000, 'Maximum loan amount is CFA 500,000'),
  duration_days: z.number()
    .min(7,   'Minimum duration is 7 days')
    .max(365, 'Maximum duration is 365 days'),
  interest_rate_bps: z.number()
    .min(0,    'Interest rate cannot be negative')
    .max(3000, 'Maximum interest rate is 30%'),
  required_guarantees: z.number()
    .min(1, 'At least 1 guarantor required')
    .max(10, 'Maximum 10 guarantors'),
})

export default function LoanRequestPage() {
  const navigate = useNavigate()
  const qClient  = useQueryClient()
  const { user } = useAuth()
  const { getContract, isCorrectNetwork } = useWallet()
  const [txStatus, setTxStatus] = useState(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      amount_cfa:          100000,
      duration_days:       30,
      interest_rate_bps:   1000,
      required_guarantees: 1,
    },
  })

  const amountCFA   = watch('amount_cfa')
  const interestBps = watch('interest_rate_bps')
  const totalRepay  = amountCFA + (amountCFA * interestBps / 10000)

  const mutation = useMutation({
    mutationFn: async (data) => {
      if (!isCorrectNetwork) throw new Error('Please switch to the EDL network first.')

      setTxStatus('Preparing transaction…')

      const factory = getContract(
        import.meta.env.VITE_LOAN_FACTORY_ADDRESS,
        LOAN_FACTORY_ABI
      )

      setTxStatus('Waiting for MetaMask confirmation…')
      // 1:1 CFA→wei prototype ratio
      const amountWei = ethers.parseUnits(String(data.amount_cfa), 'wei')

      const tx = await factory.createLoan(
        amountWei,
        data.duration_days,
        data.interest_rate_bps
      )

      setTxStatus('Transaction submitted — waiting for block confirmation…')
      const receipt = await tx.wait()

      setTxStatus('Syncing with server…')
      const response = await api.post('/loans', {
        amount_cfa:          data.amount_cfa,
        duration_days:       data.duration_days,
        interest_rate_bps:   data.interest_rate_bps,
        required_guarantees: data.required_guarantees,
      })

      return { receipt, loan: response.data }
    },
    onSuccess: ({ loan }) => {
      qClient.invalidateQueries({ queryKey: ['my-loans'] })
      toast.success('Loan created on-chain!')
      navigate(`/loans/${loan.loan_id}`)
    },
    onError: (error) => {
      setTxStatus(null)
      if (error.code === 4001) {
        toast.error('Transaction rejected in MetaMask.')
      } else {
        toast.error(`Failed: ${error.message}`)
      }
    },
    onSettled: () => setTxStatus(null),
  })

  if (user?.kyc_status !== 'verified') {
    return (
      <PageLayout title="Request a Loan">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="font-medium text-amber-900 mb-2">KYC Verification Required</p>
          <p className="text-sm text-amber-700 mb-4">
            You need to verify your identity before requesting a loan.
          </p>
          <button
            onClick={() => navigate('/kyc')}
            className="px-4 py-2 bg-amber-600 text-white text-sm rounded-xl hover:bg-amber-700"
          >
            Upload KYC Documents
          </button>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout title="Request a Loan">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-xl border border-gray-100 p-6">

          <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-5">

            {/* Loan amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Loan Amount (CFA)
              </label>
              <input
                type="number"
                {...register('amount_cfa', { valueAsNumber: true })}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="100000"
              />
              {errors.amount_cfa && (
                <p className="text-xs text-red-500 mt-1">{errors.amount_cfa.message}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">Min: CFA 50,000 · Max: CFA 500,000</p>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duration (days)
              </label>
              <input
                type="number"
                {...register('duration_days', { valueAsNumber: true })}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="30"
              />
              {errors.duration_days && (
                <p className="text-xs text-red-500 mt-1">{errors.duration_days.message}</p>
              )}
            </div>

            {/* Interest rate */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Interest Rate (basis points)
              </label>
              <input
                type="number"
                {...register('interest_rate_bps', { valueAsNumber: true })}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="1000"
              />
              {errors.interest_rate_bps && (
                <p className="text-xs text-red-500 mt-1">{errors.interest_rate_bps.message}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                {(interestBps / 100).toFixed(1)}% — Max 30%
              </p>
            </div>

            {/* Guarantors */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Guarantors Required
              </label>
              <input
                type="number"
                {...register('required_guarantees', { valueAsNumber: true })}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="1"
              />
              {errors.required_guarantees && (
                <p className="text-xs text-red-500 mt-1">{errors.required_guarantees.message}</p>
              )}
            </div>

            {/* Repayment summary */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <p className="text-xs text-blue-600 font-medium mb-2">Repayment Summary</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Principal</span>
                  <span className="font-medium">{formatCFA(amountCFA)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    Interest ({(interestBps / 100).toFixed(1)}%)
                  </span>
                  <span className="font-medium">{formatCFA(amountCFA * interestBps / 10000)}</span>
                </div>
                <div className="flex justify-between border-t border-blue-100 pt-1 mt-1">
                  <span className="font-medium text-gray-900">Total Repayable</span>
                  <span className="font-semibold text-blue-700">{formatCFA(totalRepay)}</span>
                </div>
              </div>
            </div>

            {/* Live tx status */}
            {txStatus && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 flex-shrink-0" />
                <p className="text-sm text-gray-600">{txStatus}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={mutation.isPending || !!txStatus}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors"
            >
              {mutation.isPending ? 'Processing…' : 'Submit Loan Request'}
            </button>

          </form>
        </div>
      </div>
    </PageLayout>
  )
}
