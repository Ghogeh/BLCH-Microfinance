import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useWallet } from '@hooks/useWallet'

// window.ethereum and BrowserProvider mocked in setup.js

const MOCK_ADDR = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'

describe('useWallet', () => {
  beforeEach(() => {
    window.ethereum.request.mockReset()
    window.ethereum.request.mockResolvedValue([MOCK_ADDR])
  })

  it('reports MetaMask as installed when window.ethereum.isMetaMask is set', () => {
    const { result } = renderHook(() => useWallet())
    expect(result.current.isMetaMaskInstalled).toBe(true)
  })

  it('starts with no account connected', () => {
    const { result } = renderHook(() => useWallet())
    expect(result.current.account).toBeNull()
  })

  it('connect() sets account to lowercase wallet address', async () => {
    const { result } = renderHook(() => useWallet())
    await act(async () => { await result.current.connect() })
    // BrowserProvider mock returns signer with getAddress() = MOCK_ADDR
    expect(result.current.account).toBe(MOCK_ADDR.toLowerCase())
  })

  it('connect() sets isConnecting true then false', async () => {
    const { result } = renderHook(() => useWallet())
    let connectingDuring = false
    await act(async () => {
      const p = result.current.connect()
      connectingDuring = result.current.isConnecting
      await p
    })
    expect(result.current.isConnecting).toBe(false)
  })

  it('connect() sets error and returns null when MetaMask is absent', async () => {
    const original = window.ethereum
    delete window.ethereum

    const { result } = renderHook(() => useWallet())
    let ret
    await act(async () => { ret = await result.current.connect() })
    expect(ret).toBeNull()
    expect(result.current.error).toMatch(/not installed/i)

    window.ethereum = original
  })

  it('disconnect() clears account and error', async () => {
    const { result } = renderHook(() => useWallet())
    await act(async () => { await result.current.connect() })
    await act(async () => { result.current.disconnect() })
    expect(result.current.account).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('registers accountsChanged and chainChanged event listeners on mount', () => {
    renderHook(() => useWallet())
    expect(window.ethereum.on).toHaveBeenCalledWith('accountsChanged', expect.any(Function))
    expect(window.ethereum.on).toHaveBeenCalledWith('chainChanged', expect.any(Function))
  })

  it('removes event listeners on unmount', () => {
    const { unmount } = renderHook(() => useWallet())
    unmount()
    expect(window.ethereum.removeListener).toHaveBeenCalledWith('accountsChanged', expect.any(Function))
    expect(window.ethereum.removeListener).toHaveBeenCalledWith('chainChanged', expect.any(Function))
  })
})
