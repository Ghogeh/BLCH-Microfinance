import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { useMutation, useQuery } from '@tanstack/react-query'
import PageLayout from '../../components/shared/PageLayout'
import { useAuth } from '../../hooks/useAuth'
import api from '../../utils/apiClient'
import toast from 'react-hot-toast'

export default function KYCPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [file, setFile]       = useState(null)
  const [docType, setDocType] = useState('national_id')

  const { data: statusData, refetch } = useQuery({
    queryKey: ['kyc-status'],
    queryFn:  () => api.get('/kyc/status').then(r => r.data),
  })

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('No document selected.')
      const form = new FormData()
      form.append('document', file)
      form.append('doc_type', docType)
      return api.post('/kyc/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },
    onSuccess: () => {
      refetch()
      toast.success('Document submitted! Awaiting MFI officer review.')
      setFile(null)
    },
    onError: (e) => toast.error(`Upload failed: ${e.response?.data?.error || e.message}`),
  })

  const onDrop = useCallback((accepted) => {
    if (accepted[0]) setFile(accepted[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': [], 'image/jpeg': [], 'image/png': [] },
    maxSize: 5 * 1024 * 1024,
    multiple: false,
  })

  const kyc = statusData

  return (
    <PageLayout title="KYC Verification">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Current KYC status */}
        <div className={`rounded-xl border p-4 ${
          kyc?.kyc_status === 'verified' ? 'bg-emerald-50 border-emerald-200' :
          kyc?.kyc_status === 'pending'  ? 'bg-amber-50  border-amber-200'   :
          kyc?.kyc_status === 'rejected' ? 'bg-red-50    border-red-200'     :
          'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2.5 h-2.5 rounded-full ${
              kyc?.kyc_status === 'verified' ? 'bg-emerald-500' :
              kyc?.kyc_status === 'pending'  ? 'bg-amber-500'  :
              kyc?.kyc_status === 'rejected' ? 'bg-red-500'    : 'bg-gray-400'
            }`} />
            <span className="text-sm font-medium capitalize">
              {kyc?.kyc_status || 'Not submitted'}
            </span>
          </div>
          {kyc?.kyc_status === 'verified' && (
            <p className="text-xs text-emerald-700">
              Identity verified ✓ — you can now request loans.
            </p>
          )}
          {kyc?.kyc_status === 'pending' && (
            <p className="text-xs text-amber-700">
              Document submitted and under review by an MFI officer.
            </p>
          )}
          {kyc?.latest_document?.rejection_reason && (
            <p className="text-xs text-red-700 mt-1">
              Reason: {kyc.latest_document.rejection_reason}
            </p>
          )}
        </div>

        {/* Upload form (only when not yet verified) */}
        {kyc?.kyc_status !== 'verified' && (
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-medium mb-4">Upload Identity Document</h3>

            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1">Document Type</label>
              <select
                value={docType}
                onChange={e => setDocType(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="national_id">National ID</option>
                <option value="passport">Passport</option>
                <option value="drivers_license">Driver's License</option>
                <option value="utility_bill">Utility Bill</option>
                <option value="business_registration">Business Registration</option>
              </select>
            </div>

            {/* Drag-and-drop zone */}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input {...getInputProps()} />
              {file ? (
                <div>
                  <p className="text-sm font-medium text-gray-700">{file.name}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <button
                    onClick={e => { e.stopPropagation(); setFile(null) }}
                    className="text-xs text-red-500 mt-2 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-600">
                    {isDragActive ? 'Drop the file here…' : 'Drag & drop or click to upload'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG — max 5 MB</p>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-400 mt-3">
              Your document is encrypted and stored off-chain.
              Only its SHA-256 hash is submitted to the blockchain.
            </p>

            <button
              onClick={() => uploadMutation.mutate()}
              disabled={!file || uploadMutation.isPending}
              className="w-full mt-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-xl"
            >
              {uploadMutation.isPending ? 'Uploading…' : 'Submit for Verification'}
            </button>
          </div>
        )}

        {kyc?.kyc_status === 'verified' && (
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700"
          >
            Go to Dashboard →
          </button>
        )}

      </div>
    </PageLayout>
  )
}
