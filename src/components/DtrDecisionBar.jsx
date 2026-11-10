import { AlertTriangle, Check, Clock, Timer, X } from 'lucide-react'
import { OT_THRESHOLD_HOURS, formatDuration, splitOT } from '../services/overtime'
import { formatYMD } from '../services/leave'

const STATUS_LOOK = {
    approved: { label: 'DTR approved', color: 'var(--accent-green)' },
    rejected: { label: 'DTR rejected', color: 'var(--accent-red)' },
    pending: { label: 'DTR pending', color: 'var(--accent-amber)' },
    pending_senior: { label: 'DTR pending', color: 'var(--accent-amber)' },
}

const clock = (d) => (d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '')
const problemText = (i) => {
    if (i.problem === 'no-end') return `OT starts ${clock(i.inAt)} but never ends`
    if (i.problem === 'no-start') return `OT ends ${clock(i.outAt)} but never starts`
    return `OT end ${clock(i.outAt)} isn’t after its start ${clock(i.inAt)}`
}

/**
 * Everything a reviewer needs to decide on a DTR, in one place: what the person
 * did (total overtime), what an approval will do (the OT → offset preview), what
 * is wrong with it (incomplete OT, each one a link to its row), and the buttons.
 *
 *   ot                otForPeriod() for the period on screen
 *   sub               the submission for this cutoff, or null
 *   canDecide         whether THIS viewer may approve/reject it
 *   showOffsetPreview the offset preview is a super-admin feature (canSeeOvertimeOffset)
 */
export default function DtrDecisionBar({ ot, sub, canDecide, onDecide, seniorName, showOffsetPreview, onJump }) {
    const status = sub ? (STATUS_LOOK[sub.status] || STATUS_LOOK.pending) : null
    const pending = sub && ['pending', 'pending_senior'].includes(sub.status)
    const { excess } = splitOT(ot.hours)
    const pct = Math.min(100, (ot.hours / OT_THRESHOLD_HOURS) * 100)
    const label = ot.window
        ? `${formatYMD(ot.window.startYMD).replace(/ \d{4}$/, '')} – ${formatYMD(ot.window.endYMD).replace(/ \d{4}$/, '')}`
        : 'All recorded overtime'

    return (
        <section className="bg-[var(--surface-1)] rounded-3xl border border-[var(--border)] p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                {/* What they did */}
                <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 bg-[var(--accent-purple)]/10 rounded-xl text-[var(--accent-purple)] shrink-0"><Timer size={18} /></div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Total overtime</p>
                        <p className="text-2xl font-bold text-[var(--text-primary)] tabular-nums" aria-label={`Total overtime ${formatDuration(ot.minutes)}`}>{formatDuration(ot.minutes)}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">{label} · {ot.sessions} {ot.sessions === 1 ? 'session' : 'sessions'}</p>
                    </div>
                </div>

                {/* What approving will do */}
                {showOffsetPreview && (
                    <div className="flex-1 min-w-[12rem] max-w-md">
                        <div className="flex items-center justify-between text-[11px] mb-1.5">
                            <span className="font-bold uppercase tracking-wider text-[var(--text-muted)]">20-hour line</span>
                            <span className="text-[var(--text-muted)] tabular-nums">{ot.hours} / {OT_THRESHOLD_HOURS} hrs</span>
                        </div>
                        <div className="h-2 rounded-full bg-[var(--surface-3)] overflow-hidden" role="img" aria-label={`${ot.hours} of ${OT_THRESHOLD_HOURS} overtime hours`}>
                            <div className="h-full" style={{ width: `${pct}%`, background: excess > 0 ? 'var(--accent-amber)' : 'var(--accent-purple)' }} />
                        </div>
                        <p className="text-xs mt-1.5 text-[var(--text-secondary)]">
                            {sub?.status === 'approved' && Number.isFinite(Number(sub.offsetEarned))
                                ? (Number(sub.offsetEarned) > 0
                                    ? <><strong className="text-[var(--accent-purple)]">{sub.offsetEarned} hrs</strong> were converted to offset when this was approved.</>
                                    : <>Nothing was converted to offset.</>)
                                : excess > 0
                                    ? <><strong className="text-[var(--accent-amber)]">{excess} hrs</strong> past {OT_THRESHOLD_HOURS} will become offset when you approve.</>
                                    : <>Under {OT_THRESHOLD_HOURS} hrs — nothing converts to offset.</>}
                        </p>
                    </div>
                )}

                {/* Where it stands, and the decision */}
                <div className="flex flex-wrap items-center gap-3 ml-auto">
                    {status ? (
                        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: status.color }}>
                            <span className="w-2 h-2 rounded-full" style={{ background: status.color }} />
                            {status.label}
                        </span>
                    ) : (
                        <span className="px-3 py-1.5 rounded-xl bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-muted)] text-xs font-bold uppercase">No submission yet</span>
                    )}

                    {canDecide ? (
                        <div className="flex gap-2">
                            <button onClick={() => onDecide('approved')} className="flex items-center gap-1.5 px-4 py-2 bg-[var(--accent-green)] hover:bg-[var(--accent-green-hover)] text-black text-xs font-bold uppercase tracking-wider rounded-xl transition-colors shadow-lg shadow-green-900/20">
                                <Check size={14} /> Approve
                            </button>
                            <button onClick={() => onDecide('rejected')} className="flex items-center gap-1.5 px-4 py-2 bg-[var(--accent-red)] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors shadow-lg shadow-red-900/20">
                                <X size={14} /> Reject
                            </button>
                        </div>
                    ) : pending && seniorName ? (
                        <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]"><Clock size={13} /> Waiting on {seniorName}</span>
                    ) : null}
                </div>
            </div>

            {/* What is wrong with it */}
            {ot.incomplete.length > 0 && (
                <div role="alert" className="rounded-2xl border border-[var(--accent-amber)]/30 bg-[var(--accent-amber)]/10 p-3">
                    <p className="flex items-center gap-2 text-xs font-bold text-[var(--accent-amber)]">
                        <AlertTriangle size={14} />
                        {ot.incomplete.length} OT {ot.incomplete.length === 1 ? 'entry isn’t' : 'entries aren’t'} counted — fix {ot.incomplete.length === 1 ? 'it' : 'them'} before approving
                    </p>
                    <ul className="mt-2 flex flex-col gap-1.5">
                        {ot.incomplete.map(i => (
                            <li key={`${i.day}_${i.session}`}>
                                <button
                                    type="button"
                                    onClick={() => onJump?.(i.day)}
                                    className="w-full text-left flex flex-wrap items-baseline gap-x-3 px-2.5 py-1.5 rounded-lg bg-[var(--surface-1)]/60 hover:bg-[var(--surface-1)] border border-transparent hover:border-[var(--accent-amber)]/40 transition-colors"
                                    title="Scroll to this day in the table"
                                >
                                    <span className="text-xs font-bold text-[var(--text-primary)]">{formatYMD(i.day).replace(/ \d{4}$/, '')}</span>
                                    <span className="text-xs text-[var(--text-secondary)]">{problemText(i)}</span>
                                    <span className="text-[10px] font-bold text-[var(--accent-amber)] ml-auto">Go to row →</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    )
}
