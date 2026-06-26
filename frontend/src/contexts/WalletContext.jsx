import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'
import toast from 'react-hot-toast'

const WalletContext = createContext(null)

const REQUIRED_CHAIN_ID = parseInt(import.meta.env.VITE_CHAIN_ID || '1337')

export function WalletProvider({ children }) {
  const [address, setAddress]         = useState(null)
  const [chainId, setChainId]         = useState(null)
  const [provider, setProvider]       = useState(null)
  const [signer, setSigner]           = useState(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false)

  const isMetaMaskInstalled = () => Boolean(window.ethereum?.isMetaMask)

  const connect = useCallback(async () => {
    if (!isMetaMaskInstalled()) {
      toast.error('MetaMask not found. Please install the MetaMask browser extension.')
      window.open('https://metamask.io', '_blank')
      return
    }

    setIsConnecting(true)
    try {
      const ethProvider = new ethers.BrowserProvider(window.ethereum)
      await ethProvider.send('eth_requestAccounts', [])

      const ethSigner   = await ethProvider.getSigner()
      const userAddress = await ethSigner.getAddress()
      const network     = await ethProvider.getNetwork()
      const userChainId = Number(network.chainId)

      setProvider(ethProvider)
      setSigner(ethSigner)
      setAddress(userAddress.toLowerCase())
      setChainId(userChainId)
      setIsCorrectNetwork(userChainId === REQUIRED_CHAIN_ID)

      if (userChainId !== REQUIRED_CHAIN_ID) {
        toast.error(`Wrong network. Please switch MetaMask to the EDL network (Chain ID: ${REQUIRED_CHAIN_ID})`)
      } else {
        toast.success(`Wallet connected: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`)
      }
    } catch (error) {
      if (error.code === 4001) {
        toast.error('Connection rejected. Please approve the MetaMask request.')
      } else {
        toast.error(`Connection failed: ${error.message}`)
      }
    } finally {
      setIsConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    setAddress(null)
    setChainId(null)
    setProvider(null)
    setSigner(null)
    setIsCorrectNetwork(false)
    toast.success('Wallet disconnected.')
  }, [])

  const getContract = useCallback((contractAddress, abi) => {
    if (!signer) throw new Error('Wallet not connected. Please connect MetaMask first.')
    return new ethers.Contract(contractAddress, abi, signer)
  }, [signer])

  const getReadContract = useCallback((contractAddress, abi) => {
    if (!provider) throw new Error('No provider available.')
    return new ethers.Contract(contractAddress, abi, provider)
  }, [provider])

  useEffect(() => {
    if (!window.ethereum) return

    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        disconnect()
        toast('MetaMask disconnected — please reconnect.')
      } else {
        setAddress(accounts[0].toLowerCase())
        toast('Account changed in MetaMask.')
      }
    }

    const handleChainChanged = (chainIdHex) => {
      const newChainId = parseInt(chainIdHex, 16)
      setChainId(newChainId)
      setIsCorrectNetwork(newChainId === REQUIRED_CHAIN_ID)
      if (newChainId !== REQUIRED_CHAIN_ID) {
        toast.error(`Network changed. Please switch to Chain ID ${REQUIRED_CHAIN_ID}`)
      } else {
        toast.success('Switched to EDL network.')
      }
    }

    window.ethereum.on('accountsChanged', handleAccountsChanged)
    window.ethereum.on('chainChanged', handleChainChanged)

    // Auto-reconnect if MetaMask already has an active connection
    window.ethereum.request({ method: 'eth_accounts' }).then((accounts) => {
      if (accounts.length > 0) connect()
    })

    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged)
      window.ethereum.removeListener('chainChanged', handleChainChanged)
    }
  }, [connect, disconnect])

  const value = {
    address,
    chainId,
    provider,
    signer,
    isConnecting,
    isCorrectNetwork,
    isConnected: Boolean(address),
    connect,
    disconnect,
    getContract,
    getReadContract,
    requiredChainId: REQUIRED_CHAIN_ID,
  }

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) throw new Error('useWallet must be used inside WalletProvider')
  return context
}
