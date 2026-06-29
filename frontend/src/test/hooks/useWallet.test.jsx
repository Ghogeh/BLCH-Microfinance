import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WalletProvider, useWallet } from '../../contexts/WalletContext'
import { AuthProvider } from '../../contexts/AuthContext'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }) => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <WalletProvider>
        <AuthProvider>{children}</AuthProvider>
      </WalletProvider>
    </BrowserRouter>
  </QueryClientProvider>
)

describe('useWallet', () => {
  beforeEach(() => {
    // WalletContext calls window.ethereum.request({ method: 'eth_accounts' }).then(...)
    // in its useEffect — the mock MUST return a Promise or .then() crashes.
    global.window.ethereum = {
      isMetaMask:      true,
      request:         vi.fn().mockImplementation(({ method }) => {
        if (method === 'eth_accounts') return Promise.resolve([])   // no auto-connect
        return Promise.resolve(null)
      }),
      on:              vi.fn(),
      removeListener:  vi.fn(),
      selectedAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      chainId:         '0x539',
    }
  })

  it('starts disconnected', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper })
    await waitFor(() => expect(result.current.isConnected).toBe(false))
    expect(result.current.address).toBeNull()
  })

  it('isCorrectNetwork is false when no wallet connected', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper })
    await waitFor(() => expect(result.current.isCorrectNetwork).toBe(false))
  })

  it('connect function exists and is callable', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper })
    await waitFor(() => expect(typeof result.current.connect).toBe('function'))
  })

  it('disconnect function exists and is callable', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper })
    await waitFor(() => expect(typeof result.current.disconnect).toBe('function'))
  })

  it('getContract throws when wallet not connected', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper })
    await waitFor(() => expect(result.current.isConnected).toBe(false))
    expect(() => result.current.getContract('0x123', [])).toThrow('Wallet not connected')
  })

  it('MetaMask not installed shows correct state', async () => {
    delete global.window.ethereum
    const { result } = renderHook(() => useWallet(), { wrapper })
    await waitFor(() => expect(result.current.isConnected).toBe(false))
  })
})
