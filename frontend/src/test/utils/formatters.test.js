import { describe, it, expect } from 'vitest'
import {
  formatAddress,
  formatCFA,
  formatTxHash,
} from '../../utils/formatters'

describe('formatAddress', () => {
  it('truncates a full address to 0x1234...5678 format', () => {
    const result = formatAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
    expect(result).toBe('0xf39F...2266')
  })

  it('returns empty string for null input', () => {
    expect(formatAddress(null)).toBe('')
    expect(formatAddress(undefined)).toBe('')
  })
})

describe('formatCFA', () => {
  it('formats a number as CFA currency', () => {
    const result = formatCFA(100000)
    expect(result).toContain('100')
    expect(result).toContain('000')
  })

  it('returns em dash for null', () => {
    expect(formatCFA(null)).toBe('—')
  })
})

describe('formatTxHash', () => {
  it('truncates a tx hash', () => {
    const hash   = '0xabc123def456789012345678901234567890abcdef1234567890abcdef12345'
    const result = formatTxHash(hash)
    expect(result.length).toBeLessThan(hash.length)
    expect(result).toContain('...')
  })

  it('returns em dash for null', () => {
    expect(formatTxHash(null)).toBe('—')
  })
})
