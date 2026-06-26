import { useState, useEffect, useCallback } from 'react'
import { BrowserProvider } from 'ethers'

const REQUIRED_CHAIN_HEX = '0x' + parseInt(import.meta.env.VITE_CHAIN_ID ?? '1337').toString(16)

export function useWallet() {
  const [account, setAccount]       = useState(null)
  const [chainId, setChainId]       = useState(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError]           = useState(null)

  const isMetaMaskInstalled =
    typeof window !== 'undefined' && Boolean(window.ethereum?.isMetaMask)

  const isCorrectChain = chainId === REQUIRED_CHAIN_HEX

  const connect = useCallback(async () => {
    if (!isMetaMaskInstalled) {
      setError('MetaMask is not installed.')
      return null
    }
    setIsConnecting(true)
    setError(null)
    try {
      await window.ethereum.request({ method: 'eth_requestAccounts' })
      const provider = new BrowserProvider(window.ethereum)
      const signer   = await provider.getSigner()
      const addr     = (await signer.getAddress()).toLowerCase()
      const network  = await provider.getNetwork()
      const hex      = '0x' + network.chainId.toString(16)
      setAccount(addr)
      setChainId(hex)
      return addr
    } catch (e) {
      setError(e.message ?? 'Connection failed')
      return null
    } finally {
      setIsConnecting(false)
    }
  }, [isMetaMaskInstalled])

  const signMessage = useCallback(async (message) => {
    const provider = new BrowserProvider(window.ethereum)
    const signer   = await provider.getSigner()
    return signer.signMessage(message)
  }, [])

  const disconnect = useCallback(() => {
    setAccount(null)
    setChainId(null)
    setError(null)
  }, [])

  useEffect(() => {
    if (!window.ethereum) return

    const onAccountsChanged = (accounts) => {
      setAccount(accounts[0]?.toLowerCase() ?? null)
    }
    const onChainChanged = (id) => setChainId(id)

    window.ethereum.on('accountsChanged', onAccountsChanged)
    window.ethereum.on('chainChanged', onChainChanged)
    return () => {
      window.ethereum.removeListener('accountsChanged', onAccountsChanged)
      window.ethereum.removeListener('chainChanged', onChainChanged)
    }
  }, [])

  return {
    account,
    chainId,
    isConnecting,
    error,
    isMetaMaskInstalled,
    isCorrectChain,
    connect,
    signMessage,
    disconnect,
  }
}
