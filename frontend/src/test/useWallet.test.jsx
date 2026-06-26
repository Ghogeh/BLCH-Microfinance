import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WalletProvider, useWallet } from '@contexts/WalletContext'

// window.ethereum and ethers.BrowserProvider mocked in setup.js

const MOCK_ADDR = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'

// Wrap renderHook in WalletProvider
const wrapper = ({ children }) => <WalletProvider>{children}</WalletProvider>

beforeEach(() => {
  window.ethereum.request.mockReset()
  // eth_accounts → [] prevents auto-connect in tests
  // eth_requestAccounts → [MOCK_ADDR] simulates user approving connection
  window.ethereum.request.mockImplementation(({ method }) => {
    if (method === 'eth_accounts')         return Promise.resolve([])
    if (method === 'eth_requestAccounts')  return Promise.resolve([MOCK_ADDR])
    return Promise.resolve(null)
  })
})

describe('useWallet / WalletContext', () => {
  it('throws when used outside WalletProvider', () => {
    // renderHook without wrapper — context is null
    expect(() => {
      const { result } = renderHook(() => useWallet())
      // access result to trigger the throw
      void result.current
    }).toThrow('useWallet must be used inside WalletProvider')
  })

  it('starts disconnected with no address', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper })
    await waitFor(() => expect(result.current.isConnecting).toBe(false))
    expect(result.current.address).toBeNull()
    expect(result.current.isConnected).toBe(false)
  })

  it('connect() sets address to lowercase wallet address', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper })
    await act(async () => { await result.current.connect() })
    expect(result.current.address).toBe(MOCK_ADDR.toLowerCase())
    expect(result.current.isConnected).toBe(true)
  })

  it('connect() sets provider and signer', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper })
    await act(async () => { await result.current.connect() })
    expect(result.current.provider).not.toBeNull()
    expect(result.current.signer).not.toBeNull()
  })

  it('connect() sets isCorrectNetwork true for chain ID 1337', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper })
    // BrowserProvider.getNetwork() mock returns chainId: BigInt(1337) — see setup.js
    await act(async () => { await result.current.connect() })
    expect(result.current.isCorrectNetwork).toBe(true)
    expect(result.current.chainId).toBe(1337)
  })

  it('connect() sets isConnecting true then false', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper })
    const connectPromise = act(async () => { await result.current.connect() })
    await connectPromise
    expect(result.current.isConnecting).toBe(false)
  })

  it('disconnect() clears address, provider, signer', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper })
    await act(async () => { await result.current.connect() })
    await act(async () => { result.current.disconnect() })
    expect(result.current.address).toBeNull()
    expect(result.current.provider).toBeNull()
    expect(result.current.signer).toBeNull()
    expect(result.current.isConnected).toBe(false)
    expect(result.current.isCorrectNetwork).toBe(false)
  })

  it('getContract() throws when wallet not connected', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper })
    await waitFor(() => expect(result.current.isConnecting).toBe(false))
    expect(() => result.current.getContract('0x123', [])).toThrow('Wallet not connected')
  })

  it('getReadContract() throws when no provider', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper })
    await waitFor(() => expect(result.current.isConnecting).toBe(false))
    expect(() => result.current.getReadContract('0x123', [])).toThrow('No provider available')
  })

  it('registers accountsChanged and chainChanged event listeners on mount', async () => {
    renderHook(() => useWallet(), { wrapper })
    expect(window.ethereum.on).toHaveBeenCalledWith('accountsChanged', expect.any(Function))
    expect(window.ethereum.on).toHaveBeenCalledWith('chainChanged', expect.any(Function))
  })

  it('removes event listeners on unmount', async () => {
    const { unmount } = renderHook(() => useWallet(), { wrapper })
    unmount()
    expect(window.ethereum.removeListener).toHaveBeenCalledWith('accountsChanged', expect.any(Function))
    expect(window.ethereum.removeListener).toHaveBeenCalledWith('chainChanged', expect.any(Function))
  })

  it('auto-connects when eth_accounts returns an existing address', async () => {
    window.ethereum.request.mockImplementation(({ method }) => {
      if (method === 'eth_accounts')        return Promise.resolve([MOCK_ADDR])
      if (method === 'eth_requestAccounts') return Promise.resolve([MOCK_ADDR])
      return Promise.resolve(null)
    })
    const { result } = renderHook(() => useWallet(), { wrapper })
    await waitFor(() => expect(result.current.address).toBe(MOCK_ADDR.toLowerCase()))
    expect(result.current.isConnected).toBe(true)
  })
})
