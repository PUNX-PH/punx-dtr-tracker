import { useMemo, useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { leaveApi } from '../../services/api'
import { LEAVE_TYPES, LEAVE_TYPE_KEYS, HOURS_PER_DAY, validateRequest, formatAmount, toYMD } from '../../services/leave'
import { inputClass } from './shared'

export default function LeaveRequestForm({ user, summary, requests, onSubmitted }) {
    const today = toYMD(new Date())
    const [type, setType] = useState('sick')
    const [startDate, setStartDate] = useState(today)
    const [endDate, setEndDate] = useState(today)
    const [hours, setHours] = useState(HOURS_PER_DAY)
    const [reason, setReason] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [message, setMessage] = useState(null) // { ok: bool, text }

    const isOffset = type === 'offset'

    // The same validator the api runs on write, so what the form says is what
    // the save will say — minus anything that changed since this page loaded.
    const check = useMemo(
        () => validateRequest({ type, startDate, endDate, hours }, summary, requests),
        [type, startDate, endDate, hours, summary, requests]
    )

    const handleStart = (value) => {
        setStartDate(value)
        // Keep the range sensible: pulling the start past the end drags the end.
        if (!endDate || endDate < value) setEndDate(value)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (check.error) return setMessage({ ok: false, text: check.error })
        setSubmitting(true)
        setMessage(null)
        const res = await leaveApi.submit(user, { type, startDate, endDate, hours, reason })
        setSubmitting(false)
        if (res.success) {
            setMessage({ ok: true, text: 'Request sent. You will be notified when it is decided.' })
            setReason('')
            onSubmitted?.()
        } else {
            setMessage({ ok: false, text: res.message })
        }
    }

    const left = summary?.[type]?.available

    return (
        <form onSubmit={handleSubmit} className="bg-[var(--surface-1)] rounded-3xl border border-[var(--border)] p-4 sm:p-6 space-y-4">
            <div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">New request</h3>
                <p className="text-xs text-[var(--text-muted)]">Goes to your assigned senior, or an admin if you have none.</p>
            </div>

            <div role="radiogroup" aria-label="Request type" className="grid grid-cols-3 gap-2">
                {LEAVE_TYPE_KEYS.map(k => {
                    const t = LEAVE_TYPES[k]
                    const active = type === k
                    return (
                        <button
                            key={k}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => { setType(k); setMessage(null) }}
                            className="px-2 py-2.5 rounded-xl text-xs font-bold border transition-colors"
                            style={active
                                ? { color: t.color, borderColor: t.color, background: `color-mix(in srgb, ${t.color} 12%, transparent)` }
                                : { color: 'var(--text-secondary)', borderColor: 'var(--border-strong)', background: 'var(--surface-3)' }}
                        >
                            {t.label}
                        </button>
                    )
                })}
            </div>

            {isOffset ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Date</span>
                        <input type="date" className={`${inputClass} mt-1`} value={startDate} onChange={(e) => handleStart(e.target.value)} required />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Hours to offset</span>
                        <input
                            type="number"
                            className={`${inputClass} mt-1`}
                            min="0.5" max={HOURS_PER_DAY} step="0.5"
                            value={hours}
                            onChange={(e) => setHours(e.target.value)}
                            required
                        />
                    </label>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">From</span>
                        <input type="date" className={`${inputClass} mt-1`} value={startDate} onChange={(e) => handleStart(e.target.value)} required />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">To</span>
                        <input type="date" className={`${inputClass} mt-1`} value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} required />
                    </label>
                </div>
            )}

            <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Reason <span className="normal-case font-medium">(optional)</span></span>
                <textarea
                    className={`${inputClass} mt-1 h-20 resize-none`}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={type === 'sick' ? 'e.g. Fever, doctor’s advice to rest' : type === 'vacation' ? 'e.g. Family trip' : 'e.g. Offsetting last Saturday’s overtime'}
                />
            </label>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className={`text-xs ${check.error ? 'text-[var(--accent-red)]' : 'text-[var(--text-secondary)]'}`} aria-live="polite">
                    {check.error
                        ? check.error
                        : `This uses ${formatAmount(type, check.amount)}${left !== undefined ? ` of your ${formatAmount(type, Math.max(0, left))} available` : ''}.`}
                </p>
                <button
                    type="submit"
                    disabled={submitting || !!check.error}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[var(--accent-purple)] hover:bg-[var(--accent-purple-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors shrink-0"
                >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    Submit request
                </button>
            </div>

            {message && (
                <p
                    role="status"
                    className={`text-xs px-3 py-2 rounded-lg border ${message.ok
                        ? 'text-[var(--accent-green)] bg-[var(--accent-green)]/10 border-[var(--accent-green)]/20'
                        : 'text-[var(--accent-red)] bg-[var(--accent-red)]/10 border-[var(--accent-red)]/20'}`}
                >
                    {message.text}
                </p>
            )}
        </form>
    )
}
