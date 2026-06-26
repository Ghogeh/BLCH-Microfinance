export const LOAN_STATES = {
  OPEN:      { label: 'Open',      color: 'loan-open',      bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' },
  FUNDING:   { label: 'Funding',   color: 'loan-funding',   bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  ACTIVE:    { label: 'Active',    color: 'loan-active',    bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  REPAID:    { label: 'Repaid',    color: 'loan-repaid',    bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200' },
  DEFAULTED: { label: 'Defaulted', color: 'loan-defaulted', bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200' },
}

export const CREDIT_RATING = {
  GOOD: { label: 'Good', color: 'text-emerald-600', bg: 'bg-emerald-50', minScore: 70 },
  FAIR: { label: 'Fair', color: 'text-amber-600',   bg: 'bg-amber-50',   minScore: 40 },
  POOR: { label: 'Poor', color: 'text-red-600',     bg: 'bg-red-50',     minScore: 0  },
}

export function getCreditRating(score) {
  if (score >= 70) return CREDIT_RATING.GOOD
  if (score >= 40) return CREDIT_RATING.FAIR
  return CREDIT_RATING.POOR
}

export const ROLE_CONFIG = {
  entrepreneur: { label: 'Entrepreneur', color: 'text-blue-700',   bg: 'bg-blue-50',   home: '/dashboard' },
  lender:       { label: 'Lender',       color: 'text-purple-700', bg: 'bg-purple-50', home: '/lender' },
  officer:      { label: 'MFI Officer',  color: 'text-teal-700',   bg: 'bg-teal-50',   home: '/officer' },
  regulator:    { label: 'Regulator',    color: 'text-orange-700', bg: 'bg-orange-50', home: '/audit' },
  admin:        { label: 'Admin',        color: 'text-gray-700',   bg: 'bg-gray-50',   home: '/admin' },
}
