import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import RequireAuth from './components/auth/RequireAuth'
import RequireRole from './components/auth/RequireRole'
import RequireKYC  from './components/auth/RequireKYC'

const LoginPage         = lazy(() => import('./pages/Auth/LoginPage'))
const RegisterPage      = lazy(() => import('./pages/Auth/RegisterPage'))
const KYCPage           = lazy(() => import('./pages/Auth/KYCPage'))
const BorrowerDashboard = lazy(() => import('./pages/Dashboard/BorrowerDashboard'))
const LoanRequestPage   = lazy(() => import('./pages/Loan/LoanRequestPage'))
const LoanDetailPage    = lazy(() => import('./pages/Loan/LoanDetailPage'))
const RepaymentPage     = lazy(() => import('./pages/Loan/RepaymentPage'))
const LenderDashboard   = lazy(() => import('./pages/Lender/LenderDashboard'))
const OfficerPanel      = lazy(() => import('./pages/Officer/OfficerPanel'))
const AuditPortal       = lazy(() => import('./pages/Audit/AuditPortal'))
const CreditPassport    = lazy(() => import('./pages/Credit/CreditPassport'))

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-slate-950">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4" />
      <p className="text-sm text-slate-400">Loading EDL…</p>
    </div>
  </div>
)

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public */}
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* KYC upload — auth required, KYC not yet required */}
        <Route path="/kyc" element={
          <RequireAuth><KYCPage /></RequireAuth>
        } />

        {/* Entrepreneur */}
        <Route path="/dashboard" element={
          <RequireAuth>
            <RequireRole role="entrepreneur">
              <BorrowerDashboard />
            </RequireRole>
          </RequireAuth>
        } />
        <Route path="/loans/new" element={
          <RequireAuth>
            <RequireRole role="entrepreneur">
              <RequireKYC>
                <LoanRequestPage />
              </RequireKYC>
            </RequireRole>
          </RequireAuth>
        } />
        <Route path="/loans/:id/repay" element={
          <RequireAuth>
            <RequireRole role="entrepreneur">
              <RepaymentPage />
            </RequireRole>
          </RequireAuth>
        } />

        {/* Shared loan detail — any authenticated user */}
        <Route path="/loans/:id" element={
          <RequireAuth><LoanDetailPage /></RequireAuth>
        } />

        {/* Lender */}
        <Route path="/lender" element={
          <RequireAuth>
            <RequireRole role="lender">
              <LenderDashboard />
            </RequireRole>
          </RequireAuth>
        } />

        {/* Officer */}
        <Route path="/officer" element={
          <RequireAuth>
            <RequireRole role="officer">
              <OfficerPanel />
            </RequireRole>
          </RequireAuth>
        } />

        {/* Regulator */}
        <Route path="/audit" element={
          <RequireAuth>
            <RequireRole role="regulator">
              <AuditPortal />
            </RequireRole>
          </RequireAuth>
        } />

        {/* Credit passport — lenders, regulators, admins */}
        <Route path="/credit-passport/:wallet" element={
          <RequireAuth>
            <RequireRole role={['lender', 'regulator', 'admin']}>
              <CreditPassport />
            </RequireRole>
          </RequireAuth>
        } />

        {/* Default */}
        <Route path="/"  element={<Navigate to="/login" replace />} />
        <Route path="*"  element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  )
}
