import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Pencil, Plus, Repeat, RotateCcw, Trash2 } from 'lucide-react'
import { holidayApi } from '../../services/api'
import { HOLIDAY_TYPES, MAX_SPAN_DAYS, holidaysForYears } from '../../services/holidays'
import { formatYMD } from '../../services/leave'
import { inputClass } from '../leave/shared'

const SOURCE_LABEL = { ph: 'Built-in', 'ph-edited': 'Edited', company: 'Company' }
const blank = (year) => ({ id: null, date: `${year}-01-01`, endDate: '', multi: false, name: '', type: 'company', recurring: false })

// "Thu, 1 Jan" for one day, "Mon, 2 Nov – Wed, 4 Nov" for a run (the year only when it changes).
const noYear = (ymd) => formatYMD(ymd).replace(/ \d{4}$/, '')
const rangeLabel = (h) => {
    if (!h.days || h.days < 2) return noYear(h.date)
    return h.endDate.slice(0, 4) === h.date.slice(0, 4) ? `${noYear(h.date)} – ${noYear(h.endDate)}` : `${noYear(h.date)} – ${formatYMD(h.endDate)}`
}

/**
 * Holidays for one year: the built-in Philippine list with HR's changes on top.
 * The built-in list is a starting point — proclamations move and add days — so
 * every entry can be edited or removed, and removed ones can be brought back.
 * A holiday HR adds can last several days and can repeat every year.
 */
export default function HolidaysAdmin({ stored, onChanged }) {
    const [year, setYear] = useState(new Date().getFullYear())
    const [form, setForm] = useState(null) // { id|null, date, endDate, multi, name, type, recurring }
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const list = useMemo(
        () => holidaysForYears([year], stored).filter(h => h.date.startsWith(`${year}-`)),
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
        const payload = { ...form, endDate: form.multi ? form.endDate : '' }
        if (form.multi && !form.endDate) { setError('Pick the last day of the holiday, or untick “Lasts more than one day”.'); return }
        if (await run(() => holidayApi.save(form.id, payload))) setForm(null)
    }

    // Editing any occurrence of a repeating holiday edits the whole series, so the
    // form opens on the series' own first date, not the year being looked at.
    const openEdit = (h) => {
        const base = stored.find(d => d.id === h.seriesId) || h
        const end = base.endDate && base.endDate !== base.date ? base.endDate : ''
        setError('')
        setForm({ id: h.seriesId, date: base.date, endDate: end, multi: !!end, name: base.name, type: base.type, recurring: base.recurring === true })
    }

    const remove = (h) => {
        const what = h.source === 'company' ? 'Delete' : 'Remove'
        const more = h.recurring ? ' It repeats every year, so it will be removed from every year.' : ''
        if (window.confirm(`${what} ${h.name} (${rangeLabel(h)})?${more}`)) run(() => holidayApi.remove(h))
    }

    const stopRepeating = (h) => {
        if (window.confirm(`Stop ${h.name} repeating every year? It stays on its first date and disappears from the years after.`)) run(() => holidayApi.stopRepeating(h.seriesId))
    }

    const isBuiltInEdit = !!form?.id && form.id.startsWith('ph-')

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
                <button onClick={() => { setError(''); setForm(blank(year)) }} className="flex items-center gap-1.5 px-4 py-2 bg-[var(--accent-purple)] hover:bg-[var(--accent-purple-hover)] text-white text-xs font-bold rounded-lg shrink-0">
                    <Plus size={14} /> Add holiday
                </button>
            </div>

            <div className="flex items-center gap-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-1 w-fit">
                <button aria-label="Previous year" onClick={() => setYear(y => y - 1)} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)]"><ChevronLeft size={16} /></button>
                <span className="min-w-[4rem] text-center text-sm font-bold text-[var(--text-primary)]">{year}</span>
                <button aria-label="Next year" onClick={() => setYear(y => y + 1)} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)]"><ChevronRight size={16} /></button>
            </div>

            {form && (
                <form onSubmit={save} className="p-4 bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-[10rem_1fr_13rem] gap-3 items-end">
                        <label className="text-xs font-bold text-[var(--text-muted)]">{form.multi ? 'First day' : 'Date'}
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
                    </div>

                    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                            <input
                                type="checkbox"
                                checked={form.multi}
                                onChange={(e) => setForm({ ...form, multi: e.target.checked, endDate: e.target.checked ? (form.endDate || form.date) : '' })}
                                className="w-4 h-4 accent-[var(--accent-purple)]"
                            />
                            Lasts more than one day
                        </label>
                        {form.multi && (
                            <label className="text-xs font-bold text-[var(--text-muted)]">Last day (up to {MAX_SPAN_DAYS} days)
                                <input type="date" value={form.endDate} min={form.date} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required className={`${inputClass} mt-1 !w-auto`} />
                            </label>
                        )}
                        <label className={`flex items-center gap-2 text-sm ${isBuiltInEdit ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'}`} title={isBuiltInEdit ? 'Built-in holidays already repeat by themselves' : undefined}>
                            <input
                                type="checkbox"
                                checked={form.recurring && !isBuiltInEdit}
                                disabled={isBuiltInEdit}
                                onChange={(e) => setForm({ ...form, recurring: e.target.checked })}
                                className="w-4 h-4 accent-[var(--accent-purple)]"
                            />
                            Repeats every year
                        </label>
                    </div>
                    {form.recurring && !isBuiltInEdit && (
                        <p className="text-[11px] text-[var(--text-muted)]">Appears on the same date every year from {form.date.slice(0, 4)} onward. You can stop it repeating any time.</p>
                    )}

                    <div className="flex gap-2">
                        <button disabled={busy} className="px-4 py-2 bg-[var(--accent-purple)] hover:bg-[var(--accent-purple-hover)] text-white text-xs font-bold rounded-lg disabled:opacity-50">Save</button>
                        <button type="button" onClick={() => { setForm(null); setError('') }} className="px-4 py-2 bg-[var(--surface-3)] text-[var(--text-secondary)] text-xs font-bold rounded-lg border border-[var(--border-strong)]">Cancel</button>
                    </div>
                </form>
            )}

            {error && <p role="alert" className="text-sm text-[var(--accent-red)]">{error}</p>}

            <ul className="divide-y divide-[var(--border)]">
                {list.map(h => (
                    <li key={h.id} className="flex items-center gap-3 py-3">
                        <span className="w-36 sm:w-44 shrink-0 text-xs font-mono text-[var(--text-secondary)]">{rangeLabel(h)}</span>
                        <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-[var(--text-primary)] truncate">{h.name}</span>
                            <span className="block text-[10px] font-bold uppercase" style={{ color: HOLIDAY_TYPES[h.type].color }}>
                                {HOLIDAY_TYPES[h.type].label}<span className="text-[var(--text-muted)] font-semibold normal-case"> · {SOURCE_LABEL[h.source]}{h.days > 1 ? ` · ${h.days} days` : ''}</span>
                                {h.recurring && <span className="ml-2 inline-flex items-center gap-1 text-[var(--accent-purple)] normal-case font-semibold"><Repeat size={10} /> Every year</span>}
                            </span>
                        </span>
                        {h.recurring && (
                            <button onClick={() => stopRepeating(h)} disabled={busy} className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-[var(--surface-3)] text-[var(--text-secondary)] border border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:opacity-50 shrink-0">Stop repeating</button>
                        )}
                        {h.source === 'ph-edited' && (
                            <button onClick={() => run(() => holidayApi.restore(h.id))} aria-label={`Restore the original ${h.name}`} title="Back to the built-in version" className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)]"><RotateCcw size={14} /></button>
                        )}
                        <button onClick={() => openEdit(h)} aria-label={`Edit ${h.name}`} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)]"><Pencil size={14} /></button>
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
