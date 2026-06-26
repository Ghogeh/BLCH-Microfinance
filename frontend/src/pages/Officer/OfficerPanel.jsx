import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import PageLayout from '../../components/shared/PageLayout'
import DataTable from '../../components/shared/DataTable'
import api from '../../utils/apiClient'
import { formatAddress, timeAgo } from '../../utils/formatters'
import toast from 'react-hot-toast'

export default function OfficerPanel() {
  const qClient = useQueryClient()
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [activeTab, setActiveTab]       = useState('kyc')

  const { data: kycQueue, isLoading: kycLoading } = useQuery({
    queryKey: ['kyc-queue'],
    queryFn:  () => api.get('/officer/kyc/queue').then(r => r.data),
    refetchInterval: 10000,
  })

  const pendingKYC = kycQueue?.data || []

  const verifyMutation = useMutation({
    mutationFn: (userId) => api.post(`/officer/kyc/${userId}/verify`),
    onSuccess: () => {
      qClient.invalidateQueries({ queryKey: ['kyc-queue'] })
      toast.success('Identity verified on-chain!')
    },
    onError: (e) => toast.error(`Verification failed: ${e.response?.data?.error || e.message}`),
  })

  const rejectMutation = useMutation({
    mutationFn: ({ userId, reason }) =>
      api.post(`/officer/kyc/${userId}/reject`, { reason }),
    onSuccess: () => {
      qClient.invalidateQueries({ queryKey: ['kyc-queue'] })
      setRejectTarget(null)
      setRejectReason('')
      toast.success('KYC submission rejected.')
    },
    onError: (e) => toast.error(`Rejection failed: ${e.response?.data?.error || e.message}`),
  })

  const kycColumns = [
    {
      key: 'user',
      label: 'Applicant',
      render: (_, row) => (
        <div>
          <p className="font-medium text-sm">{row.user?.name || 'Unnamed'}</p>
          <p className="text-xs text-gray-400 font-mono">
            {formatAddress(row.user?.wallet_address)}
          </p>
        </div>
      ),
    },
    {
      key: 'doc_type',
      label: 'Document Type',
      render: v => v?.replace(/_/g, ' ') || 'Unknown',
    },
    {
      key: 'created_at',
      label: 'Submitted',
      render: v => timeAgo(v),
    },
    {
      key: 'sha256_hash',
      label: 'Hash (first 16)',
      render: v => v
        ? <span className="font-mono text-xs">{v.slice(0, 16)}…</span>
        : '—',
    },
    {
      key: '_actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex gap-2">
          <button
            onClick={() => verifyMutation.mutate(row.user_id)}
            disabled={verifyMutation.isPending}
            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg disabled:opacity-50"
          >
            Verify
          </button>
          <button
            onClick={() => setRejectTarget(row)}
            className="px-3 py-1 border border-red-200 text-red-600 text-xs rounded-lg hover:bg-red-50"
          >
            Reject
          </button>
        </div>
      ),
    },
  ]

  return (
    <PageLayout title="MFI Officer Panel">

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('kyc')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'kyc'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          KYC Queue
          {pendingKYC.length > 0 && (
            <span className="ml-2 bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full">
              {pendingKYC.length}
            </span>
          )}
        </button>
      </div>

      {/* Rejection modal */}
      {rejectTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold mb-1">Reject KYC Submission</h3>
            <p className="text-sm text-gray-500 mb-4">
              For: {rejectTarget.user?.name} ({formatAddress(rejectTarget.user?.wallet_address)})
            </p>

            <label className="block text-sm font-medium mb-1">Reason (required)</label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. Document is illegible or expired. Please resubmit with a valid national ID."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm mb-4 resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
            />

            <div className="flex gap-2">
              <button
                onClick={() => rejectMutation.mutate({
                  userId: rejectTarget.user_id,
                  reason: rejectReason,
                })}
                disabled={!rejectReason.trim() || rejectMutation.isPending}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl"
              >
                {rejectMutation.isPending ? 'Submitting…' : 'Reject'}
              </button>
              <button
                onClick={() => { setRejectTarget(null); setRejectReason('') }}
                className="px-4 py-2.5 border border-gray-200 text-sm rounded-xl hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KYC queue table */}
      <div className="bg-white rounded-xl border border-gray-100">
        <div className="px-4 py-3 border-b border-gray-50">
          <h2 className="text-sm font-medium">
            Pending KYC Submissions
            <span className="ml-2 text-xs text-gray-400">(oldest first)</span>
          </h2>
        </div>
        <DataTable
          columns={kycColumns}
          rows={pendingKYC}
          isLoading={kycLoading}
          emptyMessage="No pending KYC submissions."
        />
      </div>

    </PageLayout>
  )
}
