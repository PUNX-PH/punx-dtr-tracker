import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Search, SlidersHorizontal, X, Loader2 } from 'lucide-react'
import { leaveApi, overtimeApi } from '../../services/api'
import { OFFSET_WARN_HOURS, OT_THRESHOLD_HOURS, offsetOverWarning } from '../../services/overtime'
import { LEAVE_TYPES, LEAVE_TYPE_KEYS, DEFAULT_ALLOTMENT, summarize, formatAmount } from '../../services/leave'
import { canSeeOvertimeOffset } from '../../services/leave'
import { inputClass } from './shared'

/**
 * HR/admin: everyone's balances at a glance, and the one place they are changed.
 * Every change is a signed credit or deduction with a mandatory reason, which
 * lands in leaveAdjustments — balances are never overwritten silently.
 */
const round2 = (n) => Math.round(n * 100) / 100

export default function LeaveBalancesAdmin({ admin, users, requests, allotted, earned = {}, onChanged }) {
    // The over-30-hours warning is for super admins; everyone else sees the numbers.
    const isSuper = canSeeOvertimeOffset(admin)
    const [search, setSearch] = useState('')
    const [target, setTarget] = useState(null) // the employee being adjusted

    const rows = useMemo(() => users
        .filter(u => !u.removed)
        .filter(u => (u.name || '').toLowerCase().includes(search.toLowerCase()) || (u.email || '').toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .map(u => {
            // What HR set by hand (the only part an adjustment can change) …
            const base = allotted[u.id] || DEFAULT_ALLOTMENT
            // … plus the offset overtime has added. The table shows the total.
            const fromOT = earned[u.id] || 0
            const total = { ...base, offset: round2(base.offset + fromOT) }
            return {
                user: u,
                base,
                fromOT,
                // Someone with no balance doc is on the defaults, and the row says so.
                custom: !!allotted[u.id],
                summary: summarize(total, requests.filter(r => r.userId === u.id)),
            }
        }), [users, requests, allotted, earned, search])

    const overWarn = useMemo(
        () => (isSuper ? rows.filter(r => offsetOverWarning(r.summary.offset.remaining)) : []),
        [rows, isSuper]
    )

    return (
        <section className="bg-[var(--surface-1)] rounded-3xl border border-[var(--border)] overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h3 className="text-lg font-bold text-[var(--text-primary)]">Leave & offset balances</h3>
                    <p className="text-xs text-[var(--text-muted)]">Remaining of granted (used). Days for leave, hours for offset.</p>
                </div>
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] h-4 w-4" />
                    <input
                        type="text"
                        placeholder="Search employees..."
                        className="w-full bg-[var(--surface-3)] text-[var(--text-primary)] text-sm rounded-xl py-2 pl-9 pr-4 focus:outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {overWarn.length > 0 && (
                <div role="alert" className="mx-4 sm:mx-6 mt-4 flex items-start gap-3 p-3 rounded-xl bg-[var(--accent-amber)]/10 border border-[var(--accent-amber)]/30 text-xs text-[var(--text-secondary)]">
                    <AlertTriangle size={16} className="text-[var(--accent-amber)] shrink-0 mt-0.5" />
                    <p>
                        <strong className="text-[var(--accent-amber)]">{overWarn.length} {overWarn.length === 1 ? 'person has' : 'people have'} more than {OFFSET_WARN_HOURS} hours of offset:</strong>{' '}
                        {overWarn.map(r => `${r.user.name || r.user.email} (${r.summary.offset.remaining}h)`).join(', ')}.
                        There is no cap, so the extra hours still count — open Adjust to see where they came from.
                    </p>
                </div>
            )}

            <p className="md:hidden px-4 pt-3 text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Swipe sideways for all balances</p>
            {/* `relative` so the sr-only header below is clipped by this scroller
                instead of escaping it and widening the whole page. */}
            <div className="relative overflow-x-auto overscroll-x-contain">
                <table className="w-full min-w-[640px] text-left">
                    <thead className="bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                        <tr>
                            <th className="px-4 sm:px-6 py-3">Employee</th>
                            {LEAVE_TYPE_KEYS.map(k => (
                                <th key={k} className="px-3 py-3" style={{ color: LEAVE_TYPES[k].color }}>{LEAVE_TYPES[k].label}</th>
                            ))}
                            <th className="px-4 py-3 text-right"><span className="sr-only">Adjust</span></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                        {rows.length === 0 ? (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-[var(--text-muted)]">No employees found.</td></tr>
                        ) : rows.map(({ user, custom, summary, fromOT }) => (
                            <tr key={user.id} className="hover:bg-white/5 transition-colors">
                                <td className="px-4 sm:px-6 py-3">
                                    <p className="text-sm font-bold text-[var(--text-primary)] truncate max-w-[200px]">{user.name || 'Unknown'}</p>
                                    <p className="text-[11px] text-[var(--text-muted)] truncate max-w-[200px]">
                                        {user.email}{!custom && <span className="ml-1 text-[var(--accent-purple)]">· default balance</span>}
                                    </p>
                                </td>
                                {LEAVE_TYPE_KEYS.map(k => {
                                    const b = summary[k]
                                    const warn = isSuper && k === 'offset' && offsetOverWarning(b.remaining)
                                    return (
                                        <td key={k} className="px-3 py-3 text-sm tabular-nums">
                                            <span className={`font-bold ${b.remaining <= 0 ? 'text-[var(--accent-red)]' : warn ? 'text-[var(--accent-amber)]' : 'text-[var(--text-primary)]'}`}>{b.remaining}</span>
                                            {warn && <AlertTriangle size={12} className="inline ml-1 -mt-0.5 text-[var(--accent-amber)]" aria-label={`More than ${OFFSET_WARN_HOURS} hours of offset`} />}
                                            <span className="text-[var(--text-muted)]"> / {b.allotted}</span>
                                            <span className="text-[10px] text-[var(--text-muted)] block">{b.used} used{b.pending > 0 ? ` · ${b.pending} pending` : ''}{isSuper && k === 'offset' && fromOT > 0 ? ` · ${fromOT} from OT` : ''}</span>
                                        </td>
                                    )
                                })}
                                <td className="px-4 py-3 text-right">
                                    <button
                                        onClick={() => setTarget(user)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-3)] hover:bg-[var(--surface-3-hover)] text-[var(--text-primary)] text-xs font-bold rounded-lg border border-[var(--border-strong)] transition-colors"
                                    >
                                        <SlidersHorizontal size={12} /> Adjust
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {target && (
                <AdjustModal
                    admin={admin}
                    employee={target}
                    allotted={allotted[target.id] || DEFAULT_ALLOTMENT}
                    fromOT={isSuper ? (earned[target.id] || 0) : 0}
                    isSuper={isSuper}
                    summary={rows.find(r => r.user.id === target.id)?.summary}
                    onClose={() => setTarget(null)}
                    onSaved={() => { onChanged?.() }}
                />
            )}
        </section>
    )
}

function AdjustModal({ admin, employee, allotted, fromOT, isSuper, summary, onClose, onSaved }) {
    const [type, setType] = useState('sick')
    const [mode, setMode] = useState('credit') // 'credit' | 'deduct'
    const [amount, setAmount] = useState('')
    const [reason, setReason] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [history, setHistory] = useState(null) // null = loading, 'error' = failed, else the list
    const [conversions, setConversions] = useState(null) // same states, for overtime → offset

    useEffect(() => {
        let cancelled = false
        leaveApi.getAdjustments(employee.id)
            .then(h => { if (!cancelled) setHistory(h) })
            .catch((e) => { console.error('Load adjustments failed', e); if (!cancelled) setHistory('error') })
        overtimeApi.getConversions(employee.id)
            .then(c => { if (!cancelled) setConversions(c) })
            .catch((e) => { console.error('Load OT conversions failed', e); if (!cancelled) setConversions('error') })
        return () => { cancelled = true }
    }, [employee.id])

    const unit = LEAVE_TYPES[type].unit === 'hour' ? 'hours' : 'days'
    const signed = (Number(amount) || 0) * (mode === 'credit' ? 1 : -1)
    const after = Math.round((allotted[type] + signed) * 100) / 100

    const save = async () => {
        setError('')
        if (!(Number(amount) > 0)) return setError('Enter an amount greater than zero.')
        setSaving(true)
        const res = await leaveApi.adjustBalance(employee.id, type, signed, reason, admin)
        setSaving(false)
        if (!res.success) return setError(res.message)
        onSaved?.()
        onClose()
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={`Adjust balance for ${employee.name}`}
                className="bg-[var(--surface-1)] border border-[var(--border-strong)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90dvh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 sm:p-6 border-b border-[var(--border)] flex items-start justify-between gap-3 shrink-0">
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold text-[var(--text-primary)] truncate">Adjust balance</h3>
                        <p className="text-xs text-[var(--text-muted)] truncate">{employee.name} · {employee.email}</p>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-4 sm:p-6 space-y-4 overflow-y-auto overscroll-contain">
                    <div className="grid grid-cols-3 gap-2">
                        {LEAVE_TYPE_KEYS.map(k => {
                            const t = LEAVE_TYPES[k]
                            const active = type === k
                            return (
                                <button
                                    key={k}
                                    type="button"
                                    onClick={() => setType(k)}
                                    aria-pressed={active}
                                    className="px-2 py-2 rounded-xl text-xs font-bold border transition-colors"
                                    style={active
                                        ? { color: t.color, borderColor: t.color, background: `color-mix(in srgb, ${t.color} 12%, transparent)` }
                                        : { color: 'var(--text-secondary)', borderColor: 'var(--border-strong)', background: 'var(--surface-3)' }}
                                >
                                    {t.label}
                                    <span className="block text-[10px] font-medium opacity-80">{summary[k].remaining} left</span>
                                </button>
                            )
                        })}
                    </div>

                    <div className="grid grid-cols-[auto_1fr] gap-3 items-end">
                        <div className="flex rounded-xl overflow-hidden border border-[var(--border-strong)]" role="group" aria-label="Credit or deduct">
                            {['credit', 'deduct'].map(m => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setMode(m)}
                                    aria-pressed={mode === m}
                                    className={`px-3 py-2 text-xs font-bold capitalize transition-colors ${mode === m
                                        ? (m === 'credit' ? 'bg-[var(--accent-green)] text-black' : 'bg-[var(--accent-red)] text-white')
                                        : 'bg-[var(--surface-3)] text-[var(--text-secondary)]'}`}
                                >
                                    {m === 'credit' ? '+ Credit' : '− Deduct'}
                                </button>
                            ))}
                        </div>
                        <label className="block">
                            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Amount ({unit})</span>
                            <input
                                type="number"
                                min="0"
                                step={unit === 'hours' ? '0.5' : '1'}
                                className={`${inputClass} mt-1`}
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                            />
                        </label>
                    </div>

                    {isSuper && offsetOverWarning(summary?.offset.remaining) && (
                        <p className="flex items-start gap-2 text-xs text-[var(--text-secondary)] bg-[var(--accent-amber)]/10 border border-[var(--accent-amber)]/30 rounded-lg px-3 py-2">
                            <AlertTriangle size={14} className="text-[var(--accent-amber)] shrink-0 mt-0.5" />
                            <span><strong className="text-[var(--accent-amber)]">{summary.offset.remaining} hours of offset</strong> — more than {OFFSET_WARN_HOURS}. There is no cap, so every hour still counts. The history below shows where it came from.</span>
                        </p>
                    )}

                    <p className="text-xs text-[var(--text-secondary)]">
                        {type === 'offset' && fromOT > 0 ? 'HR-granted' : 'Granted'} {formatAmount(type, allotted[type])}{type === 'offset' && fromOT > 0 ? ` (plus ${fromOT} hrs from overtime, not changed here)` : ''} → <span className="font-bold text-[var(--text-primary)]">{formatAmount(type, after)}</span>
                        {after < 0 && <span className="text-[var(--accent-red)]"> (can’t go below zero)</span>}
                    </p>

                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Reason <span className="normal-case font-medium text-[var(--accent-red)]">required</span></span>
                        <input
                            type="text"
                            maxLength={500}
                            className={`${inputClass} mt-1`}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g. 2026 annual allotment, OT hours converted to offset"
                        />
                    </label>

                    {error && (
                        <p role="alert" className="text-xs text-[var(--accent-red)] bg-[var(--accent-red)]/10 border border-[var(--accent-red)]/20 rounded-lg px-3 py-2">{error}</p>
                    )}

                    {isSuper && (
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">Overtime converted to offset</p>
                        {conversions === null ? (
                            <Loader2 size={16} className="animate-spin text-[var(--text-muted)]" />
                        ) : conversions === 'error' ? (
                            <p className="text-xs text-[var(--accent-red)]">Couldn’t load the overtime history, so it may not be empty. Try reopening this.</p>
                        ) : conversions.length === 0 ? (
                            <p className="text-xs text-[var(--text-muted)]">None yet. Overtime past {OT_THRESHOLD_HOURS} hours in a cutoff is converted when that cutoff’s DTR is approved.</p>
                        ) : (
                            <ul className="space-y-2 max-h-48 overflow-y-auto overscroll-contain">
                                {conversions.map(c => <ConversionRow key={c.id} item={c} />)}
                            </ul>
                        )}
                    </div>
                    )}

                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">Adjustment history</p>
                        {history === null ? (
                            <Loader2 size={16} className="animate-spin text-[var(--text-muted)]" />
                        ) : history === 'error' ? (
                            <p className="text-xs text-[var(--accent-red)]">Couldn’t load the history, so it may not be empty. Try reopening this.</p>
                        ) : history.length === 0 ? (
                            <p className="text-xs text-[var(--text-muted)]">No adjustments yet — this person is on the default balance.</p>
                        ) : (
                            <ul className="space-y-2 max-h-40 overflow-y-auto overscroll-contain">
                                {history.map(h => (
                                    <li key={h.id} className="text-xs p-2.5 bg-[var(--surface-2)] rounded-lg border border-[var(--border)]">
                                        <span className="font-bold" style={{ color: h.delta > 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                            {h.delta > 0 ? '+' : '−'}{formatAmount(h.type, Math.abs(h.delta))}
                                        </span>{' '}
                                        <span className="text-[var(--text-primary)]">{LEAVE_TYPES[h.type]?.label}</span>
                                        <span className="text-[var(--text-muted)]"> · {h.byName || 'HR'} · {h.createdAt?.toDate?.().toLocaleDateString('en-GB')}</span>
                                        <p className="text-[var(--text-secondary)] mt-0.5 break-words">{h.reason}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-[var(--border)] flex justify-end gap-2 shrink-0">
                    <button onClick={onClose} className="px-4 py-2 bg-[var(--surface-3)] hover:bg-[var(--surface-3-hover)] text-[var(--text-primary)] text-xs font-bold rounded-xl border border-[var(--border-strong)] transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={save}
                        disabled={saving || after < 0}
                        className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-purple)] hover:bg-[var(--accent-purple-hover)] disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors"
                    >
                        {saving && <Loader2 size={14} className="animate-spin" />}
                        Save adjustment
                    </button>
                </div>
            </div>
        </div>
    )
}

const shortDate = (ts) => (ts && typeof ts.toDate === 'function' ? ts.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '?')

/** One cutoff's conversion: how much OT, what stayed OT, what became offset, and whether it counts. */
function ConversionRow({ item }) {
    const counted = item.status === 'approved'
    const ot = Number(item.otHours) || 0
    const excess = Number(item.offsetEarned) || 0
    const label = item.cutoff ? `${shortDate(item.cutoff.startDate)} – ${shortDate(item.cutoff.endDate)}` : 'Cutoff no longer listed'
    return (
        <li className="text-xs p-2.5 bg-[var(--surface-2)] rounded-lg border border-[var(--border)]">
            <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-[var(--text-primary)]">{label}</span>
                <span className={`text-[10px] font-bold uppercase ${counted ? 'text-[var(--accent-green)]' : 'text-[var(--text-muted)]'}`}>{counted ? 'Counted' : 'Not counted — DTR not approved'}</span>
            </div>
            <p className="text-[var(--text-secondary)] mt-0.5">
                {ot} hrs overtime · {Math.min(ot, OT_THRESHOLD_HOURS)} stay OT ·{' '}
                <span className="font-bold" style={{ color: excess > 0 ? 'var(--accent-purple)' : 'var(--text-muted)' }}>{excess} → offset</span>
            </p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                Credited {item.offsetConvertedAt?.toDate?.().toLocaleDateString('en-GB') || '—'}
                {item.otSessionsSkipped > 0 ? ` · ${item.otSessionsSkipped} incomplete OT ${item.otSessionsSkipped === 1 ? 'entry' : 'entries'} skipped` : ''}
            </p>
        </li>
    )
}
