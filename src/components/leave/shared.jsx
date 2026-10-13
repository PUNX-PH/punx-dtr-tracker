import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import { LEAVE_TYPES, STATUS, formatAmount, formatRange, requestAmount } from '../../services/leave'

const STATUS_STYLE = {
    [STATUS.PENDING]: { label: 'Pending', color: 'var(--accent-amber)', Icon: Clock },
    [STATUS.APPROVED]: { label: 'Approved', color: 'var(--accent-green)', Icon: CheckCircle2 },
    [STATUS.REJECTED]: { label: 'Rejected', color: 'var(--accent-red)', Icon: XCircle },
}

export function StatusBadge({ status }) {
    const s = STATUS_STYLE[status] || STATUS_STYLE[STATUS.PENDING]
    return (
        <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border shrink-0"
            style={{ color: s.color, borderColor: `color-mix(in srgb, ${s.color} 30%, transparent)`, background: `color-mix(in srgb, ${s.color} 12%, transparent)` }}
        >
            <s.Icon size={11} />
            {s.label}
        </span>
    )
}

export function TypeBadge({ type }) {
    const t = LEAVE_TYPES[type]
    if (!t) return null
    return (
        <span
            className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0"
            style={{ color: t.color, background: `color-mix(in srgb, ${t.color} 12%, transparent)` }}
        >
            {t.label}
        </span>
    )
}

const when = (ts) => (ts && typeof ts.toDate === 'function' ? ts.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

/**
 * One request, used by every list so they read the same: employee's own
 * history, the approver queue and the decision log. `actions` is a slot for
 * whatever that list can do with it (cancel, approve/reject, revoke).
 */
export function RequestCard({ request, showEmployee = false, actions = null, children = null }) {
    return (
        <div className="p-4 bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div className="min-w-0">
                    {showEmployee && (
                        <p className="text-sm font-bold text-[var(--text-primary)] truncate mb-1">{request.userName || 'Unknown employee'}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                        <TypeBadge type={request.type} />
                        <span className="text-xs font-mono text-[var(--text-secondary)]">{formatAmount(request.type, requestAmount(request))}</span>
                    </div>
                    <p className="text-sm text-[var(--text-primary)] mt-2">{formatRange(request)}</p>
                </div>
                <StatusBadge status={request.status} />
            </div>

            {request.reason && (
                <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed whitespace-pre-wrap break-words">“{request.reason}”</p>
            )}

            <p className="text-[10px] text-[var(--text-muted)] mt-2">
                Filed {when(request.createdAt)}
                {request.reviewedAt && request.status !== STATUS.PENDING && (
                    <> · {request.status === STATUS.APPROVED ? 'Approved' : 'Rejected'} by {request.reviewerName || 'a reviewer'} on {when(request.reviewedAt)}</>
                )}
            </p>
            {request.reviewNote && (
                <p className="text-xs text-[var(--text-secondary)] mt-1 break-words">Note: {request.reviewNote}</p>
            )}

            {children}
            {actions && <div className="flex flex-wrap items-center gap-2 mt-3">{actions}</div>}
        </div>
    )
}

export const inputClass = 'w-full bg-[var(--surface-3)] text-[var(--text-primary)] text-sm px-3 py-2 rounded-lg border border-[var(--border-strong)] focus:outline-none focus:border-[var(--accent-purple)] focus:ring-1 focus:ring-[var(--accent-purple)]'
