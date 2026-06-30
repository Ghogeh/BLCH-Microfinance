import { describe, it, expect } from 'vitest'
import { getCreditRating, LOAN_STATES, ROLE_CONFIG } from '../../utils/loanConfig'

describe('getCreditRating', () => {
  it('returns GOOD for score >= 70', () => {
    expect(getCreditRating(70).label).toBe('Good')
    expect(getCreditRating(100).label).toBe('Good')
  })

  it('returns FAIR for score 40–69', () => {
    expect(getCreditRating(40).label).toBe('Fair')
    expect(getCreditRating(69).label).toBe('Fair')
  })

  it('returns POOR for score < 40', () => {
    expect(getCreditRating(0).label).toBe('Poor')
    expect(getCreditRating(39).label).toBe('Poor')
  })
})

describe('LOAN_STATES', () => {
  it('has all 5 states defined', () => {
    expect(Object.keys(LOAN_STATES)).toHaveLength(5)
  })

  it('each state has label, bg, text, border properties', () => {
    Object.values(LOAN_STATES).forEach(state => {
      expect(state).toHaveProperty('label')
      expect(state).toHaveProperty('bg')
      expect(state).toHaveProperty('text')
      expect(state).toHaveProperty('border')
    })
  })
})

describe('ROLE_CONFIG', () => {
  it('has home route for every role', () => {
    ['entrepreneur', 'lender', 'officer', 'regulator', 'admin'].forEach(role => {
      expect(ROLE_CONFIG[role]).toHaveProperty('home')
    })
  })
})
