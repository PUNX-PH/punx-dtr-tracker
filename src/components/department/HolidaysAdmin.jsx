import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { holidayApi } from '../../services/api'
import { HOLIDAY_TYPES, mergeHolidays, phHolidays } from '../../services/holidays'
import { formatYMD } from '../../services/leave'
import { inputClass } from '../leave/shared'

const SOURCE_LABEL = { ph: 'Built-in', 'ph-edited': 'Edited', company: 'Company' }
const blank = (year) => ({ id: null, date: `${year}-01-01`, name: '', type: 'company' })

/**
 * Holidays for one year: the built-in Philippine list with HR's changes on top.
 * The built-in list is a starting point — proclamations move and add days — so
 * every entry can be edited or removed, and removed ones can be brought back.
 */
export default function HolidaysAdmin({ stored, onChanged }) {
    const [year, setYear] = useState(new Date().getFullYear())
    const [form, setForm] = useState(null) // { id|null, date, name, type }
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const list = useMemo(
        () => mergeHolidays(phHolidays(year), stored).filter(h => h.date.startsWith(`${year}-`)),
        [year, stored]
    )
    // Built-ins HR took off the calendar this year — shown so they can be restored.
    const hidden = useMemo(
        () => stored.filter(h => h.hidden === true && h.id.startsWith(`ph-${year}-`)),
        [year, stored]
    )

    const run = async (fn) => {
        setBusy(true); setError('')
        try {
            const res = await fn()
            if (!res.success) { setError(res.message); return false }
            await onChanged()
            return true
        } finally { setBusy(false) }
    }

    const save = async (e) => {
        e.preventDefault()
        if (await run(() => holidayApi.save(form.id, form))) setForm(null)
    }

    const remove = (h) => {
        const what = h.source === 'company' ? 'Delete' : 'Remove'
        if (window.confirm(`${what} ${h.name} (${formatYMD(h.date)})?`)) run(() => holidayApi.remove(h))
    }

    return (
        <section className="bg-[var(--surface-1)] border border-[var(--border)] rounded-3xl p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-lg font-bold text-[var(--text-primary)]">Holidays</h3>
                    <p className="text-xs text-[var(--text-muted)] max-w-xl">
                        Philippine holidays come built in and company holidays are yours to add. Check the built-in list against the
                        year's official proclamations — Eid’l Fitr and Eid’l Adha are not included because their dates are proclaimed late; add them when they are.
                    </p>
                </div>
                <button onClick={() => setForm(blank(year))} className="flex items-center gap-1.5 px-4 py-2 bg-[var(--accent-purple)] hover:bg-[var(--accent-purple-hover)] text-white text-xs font-bold rounded-lg shrink-0">
                    <Plus size={14} /> Add holiday
                </button>
            </div>

            <div className="flex items-center gap-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-1 w-fit">
                <button aria-label="Previous year" onClick={() => setYear(y => y - 1)} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)]"><ChevronLeft size={16} /></button>
                <span className="min-w-[4rem] text-center text-sm font-bold text-[var(--text-primary)]">{year}</span>
                <button aria-label="Next year" onClick={() => setYear(y => y + 1)} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)]"><ChevronRight size={16} /></button>
            </div>

            {form && (
                <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-[10rem_1fr_13rem_auto] gap-3 items-end p-4 bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl">
                    <label className="text-xs font-bold text-[var(--text-muted)]">Date
                        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required className={`${inputClass} mt-1`} />
                    </label>
                    <label className="text-xs font-bold text-[var(--text-muted)]">Name
                        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={80} placeholder="e.g. Company Foundation Day" className={`${inputClass} mt-1`} />
                    </label>
                    <label className="text-xs font-bold text-[var(--text-muted)]">Type
                        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={`${inputClass} mt-1`}>
                            {Object.entries(HOLIDAY_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
                        </select>
                    </label>
                    <div className="flex gap-2">
                        <button disabled={busy} className="px-4 py-2 bg-[var(--accent-purple)] hover:bg-[var(--accent-purple-hover)] text-white text-xs font-bold rounded-lg disabled:opacity-50">Save</button>
                        <button type="button" onClick={() => setForm(null)} className="px-4 py-2 bg-[var(--surface-3)] text-[var(--text-secondary)] text-xs font-bold rounded-lg border border-[var(--border-strong)]">Cancel</button>
                    </div>
                </form>
            )}

            {error && <p role="alert" className="text-sm text-[var(--accent-red)]">{error}</p>}

            <ul className="divide-y divide-[var(--border)]">
                {list.map(h => (
                    <li key={h.id} className="flex items-center gap-3 py-3">
                        <span className="w-24 shrink-0 text-xs font-mono text-[var(--text-secondary)]">{formatYMD(h.date).replace(/ \d{4}$/, '')}</span>
                        <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-[var(--text-primary)] truncate">{h.name}</span>
                            <span className="block text-[10px] font-bold uppercase" style={{ color: HOLIDAY_TYPES[h.type].color }}>
                                {HOLIDAY_TYPES[h.type].label}<span className="text-[var(--text-muted)] font-semibold normal-case"> · {SOURCE_LABEL[h.source]}</span>
                            </span>
                        </span>
                        {h.source === 'ph-edited' && (
                            <button onClick={() => run(() => holidayApi.restore(h.id))} aria-label={`Restore the original ${h.name}`} title="Back to the built-in version" className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)]"><RotateCcw size={14} /></button>
                        )}
                        <button onClick={() => setForm({ id: h.id, date: h.date, name: h.name, type: h.type })} aria-label={`Edit ${h.name}`} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)]"><Pencil size={14} /></button>
                        <button onClick={() => remove(h)} aria-label={`Remove ${h.name}`} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-red)] hover:bg-[var(--surface-3)]"><Trash2 size={14} /></button>
                    </li>
                ))}
                {list.length === 0 && <li className="py-8 text-sm text-[var(--text-muted)] text-center">No holidays in {year}.</li>}
            </ul>

            {hidden.length > 0 && (
                <details className="text-sm">
                    <summary className="cursor-pointer text-xs font-bold text-[var(--text-muted)]">Removed from {year} ({hidden.length})</summary>
                    <ul className="mt-2 space-y-1">
                        {hidden.map(h => (
                            <li key={h.id} className="flex items-center justify-between gap-3 py-1">
                                <span className="text-[var(--text-secondary)] truncate">{h.name} · {formatYMD(h.date)}</span>
                                <button onClick={() => run(() => holidayApi.restore(h.id))} className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg bg-[var(--surface-3)] text-[var(--text-secondary)] border border-[var(--border-strong)]"><RotateCcw size={12} /> Restore</button>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </section>
    )
}
