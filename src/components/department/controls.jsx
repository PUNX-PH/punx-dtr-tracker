import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addMonths } from '../../services/calendar'

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Prev / month name / next, plus "Today". `cursor` is { year, month } (month 0-based). */
export function MonthSwitcher({ cursor, onCursor, onToday }) {
    const goToday = () => {
        const d = new Date()
        onCursor({ year: d.getFullYear(), month: d.getMonth() })
        onToday?.(d)
    }
    return (
        <>
            <div className="flex items-center gap-1 bg-[var(--surface-1)] border border-[var(--border)] rounded-xl p-1">
                <button aria-label="Previous month" onClick={() => onCursor(addMonths(cursor, -1))} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors"><ChevronLeft size={16} /></button>
                <span className="min-w-[9.5rem] text-center text-sm font-bold text-[var(--text-primary)]">{MONTH_NAMES[cursor.month]} {cursor.year}</span>
                <button aria-label="Next month" onClick={() => onCursor(addMonths(cursor, 1))} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors"><ChevronRight size={16} /></button>
            </div>
            <button
                onClick={goToday}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
                Today
            </button>
        </>
    )
}

export function DepartmentSelect({ departments, value, onChange, allLabel = 'All departments' }) {
    return (
        <select
            aria-label="Department"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="bg-[var(--surface-3)] text-[var(--text-primary)] text-sm px-3 py-2 rounded-lg border border-[var(--border-strong)] focus:outline-none focus:border-[var(--accent-purple)] min-w-[11rem]"
        >
            <option value="">{allLabel}</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
    )
}

export function Spinner() {
    return (
        <div className="flex justify-center py-16" role="status" aria-label="Loading">
            <div className="w-8 h-8 border-4 border-[var(--border)] border-t-[var(--accent-purple)] rounded-full animate-spin" />
        </div>
    )
}

export function ErrorNote({ children }) {
    if (!children) return null
    return (
        <p role="alert" className="text-sm text-[var(--accent-red)] bg-[var(--accent-red)]/10 border border-[var(--accent-red)]/20 rounded-2xl px-4 py-3">{children}</p>
    )
}
