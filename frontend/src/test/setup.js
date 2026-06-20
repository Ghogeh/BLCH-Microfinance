import '@testing-library/jest-dom'

global.window.ethereum = {
  isMetaMask: true,
  request: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  selectedAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  chainId: '0x539',
}
