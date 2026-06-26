import { LOAN_STATES } from '../../utils/loanConfig'
import { cn } from '../../utils/cn'

export default function LoanStateBadge({ state, size = 'sm' }) {
  const config = LOAN_STATES[state] || LOAN_STATES.OPEN
  return (
    <span className={cn(
      'inline-flex items-center font-medium rounded-full border',
      config.bg, config.text, config.border,
      size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'
    )}>
      {config.label}
    </span>
  )
}
