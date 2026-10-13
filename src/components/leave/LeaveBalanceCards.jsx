import { LEAVE_TYPES, LEAVE_TYPE_KEYS, formatAmount } from '../../services/leave'

// Used / remaining per type. The bar is "used" in the type's colour with
// "pending" striped behind it, so a person can see both what is gone and what
// is already spoken for before they file another request.
export default function LeaveBalanceCards({ summary }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {LEAVE_TYPE_KEYS.map(type => {
                const t = LEAVE_TYPES[type]
                const b = summary?.[type]
                if (!b) return null
                const total = Math.max(b.allotted, b.used + b.pending, 0.0001)
                const usedPct = Math.min(100, (b.used / total) * 100)
                const pendingPct = Math.min(100 - usedPct, (b.pending / total) * 100)
                const unit = t.unit === 'hour' ? 'hrs' : 'days'

                return (
                    <div key={type} className="bg-[var(--surface-1)] rounded-3xl border border-[var(--border)] p-5">
                        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: t.color }}>{t.label}</p>
                        <div className="flex items-baseline gap-2 mt-2">
                            <span className="text-4xl font-bold text-[var(--text-primary)] tabular-nums">{b.remaining}</span>
                            <span className="text-xs text-[var(--text-muted)]">{unit} remaining</span>
                        </div>

                        <div
                            className="h-2 rounded-full bg-[var(--surface-3)] mt-4 overflow-hidden flex"
                            role="img"
                            aria-label={`${formatAmount(type, b.used)} used, ${formatAmount(type, b.pending)} pending, of ${formatAmount(type, b.allotted)}`}
                        >
                            <div style={{ width: `${usedPct}%`, background: t.color }} />
                            <div style={{ width: `${pendingPct}%`, background: `color-mix(in srgb, ${t.color} 40%, transparent)` }} />
                        </div>

                        <dl className="grid grid-cols-3 gap-2 mt-4 text-center">
                            <div>
                                <dt className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Granted</dt>
                                <dd className="text-sm font-bold text-[var(--text-primary)] tabular-nums">{b.allotted}</dd>
                            </div>
                            <div>
                                <dt className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Used</dt>
                                <dd className="text-sm font-bold text-[var(--text-primary)] tabular-nums">{b.used}</dd>
                            </div>
                            <div>
                                <dt className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Pending</dt>
                                <dd className="text-sm font-bold text-[var(--accent-amber)] tabular-nums">{b.pending}</dd>
                            </div>
                        </dl>
                    </div>
                )
            })}
        </div>
    )
}
