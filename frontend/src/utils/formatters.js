import { formatDistanceToNow, format } from 'date-fns'

export function formatAddress(address) {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function formatCFA(amount) {
  if (amount === null || amount === undefined) return '—'
  return new Intl.NumberFormat('fr-CM', {
    style:                 'currency',
    currency:              'XAF',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function timeAgo(date) {
  if (!date) return '—'
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export function formatDate(date) {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy')
}

export function formatTxHash(hash) {
  if (!hash) return '—'
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
