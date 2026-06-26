import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import PageLayout from '../../components/shared/PageLayout'
import LoanStateBadge from '../../components/shared/LoanStateBadge'
import DataTable from '../../components/shared/DataTable'
import api from '../../utils/apiClient'
import { formatCFA, formatDate, formatAddress, timeAgo, copyToClipboard } from '../../utils/formatters'
import toast from 'react-hot-toast'

function MerkleVerifier() {
  const [blockNumber, setBlockNumber] = useState('')
  const [result, setResult]           = useState(null)

  const verifyMutation = useMutation({
    mutationFn: (block) => api.get(`/audit/verify-merkle/${block}`).then(r => r.data),
    onSuccess:  (data)  => setResult(data),
    onError:    (e)     => toast.error(`Verification failed: ${e.response?.data?.error || e.message}`),
  })

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h3 className="text-sm font-medium text-gray-900 mb-1">Merkle Root Verifier</h3>
      <p className="text-xs text-gray-500 mb-4">
        Verify that a block's transaction records have not been tampered with.
        The Merkle root is recomputed and compared to the on-chain record.
      </p>

      <div className="flex gap-2 mb-4">
        <input
          type="number"
          value={blockNumber}
          onChange={e => setBlockNumber(e.target.value)}
          placeholder="Enter block number"
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        <button
          onClick={() => verifyMutation.mutate(blockNumber)}
          disabled={!blockNumber || verifyMutation.isPending}
          className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl"
        >
          {verifyMutation.isPending ? 'Verifying…' : 'Verify'}
        </button>
      </div>

      {result && (
        <div className={`rounded-xl p-4 border ${
          result.chain_match
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-3 h-3 rounded-full ${
              result.chain_match ? 'bg-emerald-500' : 'bg-red-500'
            }`} />
            <span className={`text-sm font-semibold ${
              result.chain_match ? 'text-emerald-800' : 'text-red-800'
            }`}>
              {result.chain_match ? 'VERIFIED — No tampering detected' : 'TAMPER DETECTED'}
            </span>
          </div>
          <div className="space-y-1 text-xs text-gray-600">
            <p>Block: #{result.block_number}</p>
            <p className="font-mono truncate">Merkle root: {result.merkle_root}</p>
            <p>Verified: {timeAgo(result.verified_at)}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function BlacklistPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['blacklist'],
    queryFn:  () => api.get('/audit/blacklist').then(r => r.data),
  })

  const entries = data?.data || []

  const columns = [
    {
      key: 'wallet_address',
      label: 'Wallet',
      render: v => <span className="font-mono text-xs">{formatAddress(v)}</span>,
    },
    { key: 'days_overdue', label: 'Days Overdue', render: v => `${v} days` },
    {
      key: 'reason',
      label: 'Reason',
      render: v => <span className="text-xs text-gray-600 max-w-xs truncate block">{v}</span>,
    },
    { key: 'blacklisted_at', label: 'Blacklisted', render: v => timeAgo(v) },
    {
      key: 'cobac_notified',
      label: 'COBAC Notified',
      render: v => (
        <span className={`text-xs font-medium ${v ? 'text-emerald-600' : 'text-amber-600'}`}>
          {v ? 'Yes' : 'Pending'}
        </span>
      ),
    },
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-100">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
        <h3 className="text-sm font-medium">CEMAC 2026 Blacklist Registry</h3>
        <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full border border-red-100">
          {entries.length} blacklisted
        </span>
      </div>
      <DataTable
        columns={columns}
        rows={entries}
        isLoading={isLoading}
        emptyMessage="No blacklisted addresses."
      />
    </div>
  )
}

export default function AuditPortal() {
  const [activeTab, setActiveTab] = useState('loans')

  const { data: loansData, isLoading } = useQuery({
    queryKey: ['audit-all-loans'],
    queryFn:  () => api.get('/audit/loans').then(r => r.data),
  })

  const allLoans = loansData?.data || []

  const summaryStats = [
    { label: 'Total Loans', value: allLoans.length },
    { label: 'Active',      value: allLoans.filter(l => l.state === 'ACTIVE').length },
    { label: 'Defaulted',   value: allLoans.filter(l => l.state === 'DEFAULTED').length },
    {
      label: 'Total Value',
      value: formatCFA(allLoans.reduce((s, l) => s + parseFloat(l.amount_cfa || 0), 0)),
    },
  ]

  const loanColumns = [
    { key: 'id',         label: '#', render: v => `#${v}` },
    {
      key: 'borrower',
      label: 'Borrower',
      render: (_, row) => formatAddress(row.borrower?.wallet_address),
    },
    { key: 'amount_cfa', label: 'Amount', render: v => formatCFA(v) },
    { key: 'state',      label: 'Status', render: v => <LoanStateBadge state={v} /> },
    {
      key: 'contract_address',
      label: 'Contract',
      render: v => v ? (
        <button
          onClick={() => copyToClipboard(v).then(() => toast.success('Address copied'))}
          className="font-mono text-xs text-blue-600 hover:underline"
        >
          {formatAddress(v)}
        </button>
      ) : '—',
    },
    { key: 'due_date',   label: 'Due Date', render: v => formatDate(v) },
    { key: 'created_at', label: 'Created',  render: v => timeAgo(v) },
  ]

  const tabs = [
    { id: 'loans',     label: 'All Loans' },
    { id: 'merkle',    label: 'Merkle Verifier' },
    { id: 'blacklist', label: 'Blacklist Registry' },
  ]

  return (
    <PageLayout title="COBAC Regulatory Audit Portal">

      {/* System-wide stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {summaryStats.map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">{s.label}</p>
            <p className="text-xl font-semibold mt-1 break-all">{s.value}</p>
          </div>
        ))}
      </div>

      {/* COBAC notice */}
      <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 mb-6 text-xs text-orange-700">
        <strong>COBAC Supervisory Access:</strong> This portal shows real-time data from the
        consortium blockchain without requiring institutional cooperation or data requests.
        All queries are read-only, zero-gas, and permanently logged in the audit trail.
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'loans' && (
        <div className="bg-white rounded-xl border border-gray-100">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="text-sm font-medium">
              Full Consortium Loan Ledger
              <span className="ml-2 text-xs text-gray-400">
                — all institutions, no consent required
              </span>
            </h2>
          </div>
          <DataTable
            columns={loanColumns}
            rows={allLoans}
            isLoading={isLoading}
            emptyMessage="No loans recorded in the consortium ledger."
          />
        </div>
      )}

      {activeTab === 'merkle'    && <MerkleVerifier />}
      {activeTab === 'blacklist' && <BlacklistPanel />}

    </PageLayout>
  )
}
