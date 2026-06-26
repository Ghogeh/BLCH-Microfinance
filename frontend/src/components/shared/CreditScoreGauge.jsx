import { getCreditRating } from '../../utils/loanConfig'
import { cn } from '../../utils/cn'

export default function CreditScoreGauge({ score = 50, size = 'md' }) {
  const rating       = getCreditRating(score)
  const pct          = Math.min(100, Math.max(0, score))
  const circumference = 2 * Math.PI * 40
  const offset       = circumference - (pct / 100) * circumference
  const isLg         = size === 'lg'

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative inline-flex items-center justify-center">
        <svg
          width={isLg ? 120 : 90}
          height={isLg ? 120 : 90}
          className="-rotate-90"
          viewBox="0 0 100 100"
        >
          <circle cx="50" cy="50" r="40"
            fill="none" stroke="#e5e7eb" strokeWidth="8" />
          <circle cx="50" cy="50" r="40"
            fill="none"
            stroke={pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444'}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute text-center">
          <div className={cn('font-bold leading-none', isLg ? 'text-3xl' : 'text-xl')}>
            {score}
          </div>
          <div className="text-gray-400 text-xs">/ 100</div>
        </div>
      </div>
      <span className={cn('text-xs font-medium px-2.5 py-0.5 rounded-full', rating.bg, rating.color)}>
        {rating.label} Credit
      </span>
    </div>
  )
}
