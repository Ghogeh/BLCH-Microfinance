import '@testing-library/jest-dom'

global.window.ethereum = {
  isMetaMask: true,
  request: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  selectedAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  chainId: '0x539',
}

vi.mock('ethers', async () => {
  const actual = await vi.importActual('ethers')

  const mockProviderInstance = {
    getSigner: vi.fn().mockResolvedValue({
      getAddress:  vi.fn().mockResolvedValue('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'),
      signMessage: vi.fn().mockResolvedValue('0xmocksignature'),
    }),
    getNetwork: vi.fn().mockResolvedValue({ chainId: BigInt(1337) }),
    // send() is used by WalletContext to trigger eth_requestAccounts via ethers provider
    send: vi.fn().mockResolvedValue(['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266']),
  }

  const MockBrowserProvider = vi.fn().mockImplementation(() => mockProviderInstance)
  const MockContract        = vi.fn().mockImplementation(() => ({}))

  return {
    ...actual,
    // Named imports: import { BrowserProvider } from 'ethers'
    BrowserProvider: MockBrowserProvider,
    Contract:        MockContract,
    // Namespace import: import { ethers } from 'ethers'
    // WalletContext uses ethers.BrowserProvider / ethers.Contract
    ethers: {
      ...actual.ethers,
      BrowserProvider: MockBrowserProvider,
      Contract:        MockContract,
    },
  }
})
