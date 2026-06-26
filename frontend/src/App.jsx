import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WalletProvider } from '@contexts/WalletContext'
import { AuthProvider } from '@contexts/AuthContext'
import { RoleGuard } from '@/components/guards/RoleGuard'
import LoginPage from '@pages/Auth/LoginPage'
import DashboardPage from '@pages/Dashboard/DashboardPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <AuthProvider>
          <BrowserRouter>
            <Toaster
              position="top-right"
              toastOptions={{ style: { background: '#1e293b', color: '#f1f5f9' } }}
            />
            <Routes>
              {/* Public */}
              <Route path="/login" element={<LoginPage />} />

              {/* Authenticated — any verified role */}
              <Route
                path="/dashboard"
                element={
                  <RoleGuard>
                    <DashboardPage />
                  </RoleGuard>
                }
              />

              {/* Role-specific stubs — real pages wired in M10-M12 */}
              <Route
                path="/loans/*"
                element={
                  <RoleGuard roles={['entrepreneur', 'lender', 'guarantor', 'officer', 'admin']}>
                    <DashboardPage />
                  </RoleGuard>
                }
              />
              <Route
                path="/officer/*"
                element={
                  <RoleGuard roles={['officer', 'admin']}>
                    <DashboardPage />
                  </RoleGuard>
                }
              />
              <Route
                path="/audit/*"
                element={
                  <RoleGuard roles={['regulator', 'admin']}>
                    <DashboardPage />
                  </RoleGuard>
                }
              />

              {/* KYC upload — any authenticated user */}
              <Route
                path="/kyc"
                element={
                  <RoleGuard>
                    <DashboardPage />
                  </RoleGuard>
                }
              />

              {/* Root redirect */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </WalletProvider>
    </QueryClientProvider>
  )
}

export default App
