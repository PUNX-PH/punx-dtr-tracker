import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FileText, Loader2, RefreshCw, Search } from 'lucide-react'
import { DAY_STATUS, summarizeDays } from '../../services/attendance'
import { formatYMD, parseYMD, toYMD } from '../../services/leave'
import { WEEKDAY_LABELS } from '../../services/calendar'
import { departmentName } from '../../services/org'
import { DepartmentSelect, ErrorNote, MONTH_NAMES, MonthSwitcher } from './controls'

const SORTS = {
    name: { label: 'Name', fn: (a, b) => (a.user.name || '').localeCompare(b.user.name || '') },
    late: { label: 'Most late', fn: (a, b) => b.summary.late - a.summary.late || (a.user.name || '').localeCompare(b.user.name || '') },
    attended: { label: 'Most days attended', fn: (a, b) => b.summary.attended - a.summary.attended || (a.user.name || '').localeCompare(b.user.name || '') },
}

const tint = (color, pct = 16) => `color-mix(in srgb, ${color} ${pct}%, transparent)`

function Stat({ label, value, color }) {
    return (
        <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: color || 'var(--text-primary)' }}>{value}</p>
        </div>
    )
}

const Count = ({ n, color }) => (
    <span className={n === 0 ? 'text-[var(--text-muted)]' : 'font-bold'} style={n === 0 ? undefined : { color }}>{n}</span>
)

const LEGEND = ['present', 'late', 'leave', 'offset', 'holiday', 'noentry']

/**
 * One person's month as a calendar: weekday columns, every day in its place, so
 * "what happened on the 12th" is found by position like any wall calendar. The
 * colour says what kind of day it was and the small letter repeats it, so it
 * doesn't rely on colour alone. Weekends and days still to come are drawn faint;
 * a working day with nothing on it is dashed — empty, not wrong.
 */
function MonthCalendar({ days, summary }) {
    const today = toYMD(new Date())
    const lead = days.length ? parseYMD(days[0].ymd).getDay() : 0 // blanks before the 1st, Sunday-first

    return (
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
            <div className="w-full max-w-md" role="grid" aria-label="Day by day">
                <div className="grid grid-cols-7 gap-1 mb-1" role="row">
                    {WEEKDAY_LABELS.map(w => (
                        <div key={w} role="columnheader" className="text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] py-1">{w}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} aria-hidden="true" />)}
                    {days.map(d => {
                        const st = DAY_STATUS[d.status]
                        const faint = d.status === 'weekend' || d.status === 'upcoming'
                        const empty = d.status === 'noentry'
                        const detail = d.holiday ? ` — ${d.holiday.name}` : d.leave ? ` — ${d.leave.type === 'offset' ? 'Offset' : 'Leave'}` : ''
                        const isToday = d.ymd === today
                        return (
                            <div
                                key={d.ymd}
                                role="gridcell"
                                title={`${formatYMD(d.ymd)}: ${st.label}${detail}`}
                                aria-label={`${formatYMD(d.ymd)}: ${st.label}${detail}`}
                                className={`h-12 rounded-lg px-1.5 py-1 flex flex-col justify-between border
                                    ${empty ? 'border-dashed border-[var(--border-strong)]' : 'border-transparent'}
                                    ${isToday ? 'ring-2 ring-[var(--accent-purple)]' : ''}`}
                                style={{
                                    background: faint ? 'var(--surface-3)' : empty ? 'transparent' : tint(st.color),
                                    opacity: faint ? 0.55 : 1,
                                }}
                            >
                                <span className="text-xs font-bold leading-none" style={{ color: faint || empty ? 'var(--text-secondary)' : st.color }}>{Number(d.ymd.slice(8))}</span>
                                <span className="text-[9px] font-bold leading-none self-end" style={{ color: st.color }}>{st.short}</span>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* The month at a glance, doubling as the key */}
            <ul className="flex flex-col gap-2 min-w-[10rem] pt-7" aria-label="Key">
                {LEGEND.map(k => (
                    <li key={k} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                        <span className="w-3 h-3 rounded-[4px] shrink-0 border" style={k === 'noentry' ? { borderStyle: 'dashed', borderColor: 'var(--border-strong)' } : { background: tint(DAY_STATUS[k].color, 30), borderColor: 'transparent' }} />
                        <span className="flex-1">{DAY_STATUS[k].label}</span>
                        <span className="font-bold tabular-nums" style={{ color: summary[k] > 0 ? DAY_STATUS[k].color : 'var(--text-muted)' }}>{summary[k]}</span>
                    </li>
                ))}
            </ul>
        </div>
    )
}

/**
 * Attendance monitoring for the people a viewer manages (or everyone, for HR).
 * The numbers come from attendance.js — see its header for what "late" and
 * "present" mean — so this screen only presents them.
 */
export default function AttendanceMonitor({
    cursor, onCursor, departments, scopeDepartments, deptFilter, onDeptFilter,
    rows, loading, error, onReload, onOpenDtr,
}) {
    const [search, setSearch] = useState('')
    const [sort, setSort] = useState('name')
    const [open, setOpen] = useState(null)

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase()
        return rows
            .filter(r => !deptFilter || r.user.departmentId === deptFilter)
            .filter(r => !q || (r.user.name || '').toLowerCase().includes(q) || (r.user.email || '').toLowerCase().includes(q))
            .sort(SORTS[sort].fn)
    }, [rows, deptFilter, search, sort])

    const totals = useMemo(() => summarizeDays(visible.flatMap(r => r.days)), [visible])

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <MonthSwitcher cursor={cursor} onCursor={onCursor} />
                <DepartmentSelect departments={scopeDepartments} value={deptFilter} onChange={onDeptFilter} allLabel={scopeDepartments.length > 1 ? 'All my departments' : 'All departments'} />
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search people"
                        aria-label="Search people"
                        className="bg-[var(--surface-3)] text-[var(--text-primary)] text-sm pl-9 pr-3 py-2 rounded-lg border border-[var(--border-strong)] focus:outline-none focus:border-[var(--accent-purple)] w-48"
                    />
                </div>
                <select
                    aria-label="Sort by"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    className="bg-[var(--surface-3)] text-[var(--text-primary)] text-sm px-3 py-2 rounded-lg border border-[var(--border-strong)] focus:outline-none focus:border-[var(--accent-purple)]"
                >
                    {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                </select>
                {loading
                    ? <Loader2 size={16} className="animate-spin text-[var(--accent-purple)]" aria-label="Loading" />
                    : <button onClick={onReload} aria-label="Refresh" title="Refresh" className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors"><RefreshCw size={15} /></button>}
            </div>

            <ErrorNote>{error}</ErrorNote>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Stat label="Days attended" value={totals.attended} color="var(--accent-green)" />
                <Stat label="Late arrivals" value={totals.late} color="var(--accent-amber)" />
                <Stat label="On leave / offset" value={totals.leave + totals.offset} color="var(--accent-blue)" />
            </div>

            <section className="bg-[var(--surface-1)] border border-[var(--border)] rounded-3xl overflow-hidden">
                {loading && rows.length === 0 ? (
                    <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[var(--accent-purple)]" size={28} /></div>
                ) : visible.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)] text-center py-12">
                        {rows.length === 0 ? 'No one to show yet.' : 'No one matches that.'}
                    </p>
                ) : (
                    <div className="relative overflow-x-auto">
                        <table className="w-full text-sm">
                            <caption className="sr-only">Attendance for {MONTH_NAMES[cursor.month]} {cursor.year}</caption>
                            <thead>
                                <tr className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border)]">
                                    <th scope="col" className="text-left px-4 py-3">Employee</th>
                                    <th scope="col" className="px-2 py-3 text-center">Present</th>
                                    <th scope="col" className="px-2 py-3 text-center">Late</th>
                                    <th scope="col" className="px-2 py-3 text-center">Leave</th>
                                    <th scope="col" className="px-2 py-3 text-center">Offset</th>
                                    <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map(({ user, days, summary }) => {
                                    const isOpen = open === user.id
                                    return (
                                        <FragmentRow key={user.id}>
                                            <tr className="border-b border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors">
                                                <td className="px-4 py-3">
                                                    <button
                                                        onClick={() => setOpen(isOpen ? null : user.id)}
                                                        aria-expanded={isOpen}
                                                        className="flex items-center gap-2 text-left"
                                                    >
                                                        {isOpen ? <ChevronDown size={14} className="text-[var(--text-muted)] shrink-0" /> : <ChevronRight size={14} className="text-[var(--text-muted)] shrink-0" />}
                                                        <span className="min-w-0">
                                                            <span className="block font-semibold text-[var(--text-primary)] truncate">{user.name || user.email}</span>
                                                            <span className="block text-[10px] text-[var(--text-muted)] truncate">{departmentName(departments, user.departmentId)}</span>
                                                        </span>
                                                    </button>
                                                </td>
                                                <td className="px-2 py-3 text-center"><Count n={summary.present} color="var(--accent-green)" /></td>
                                                <td className="px-2 py-3 text-center"><Count n={summary.late} color="var(--accent-amber)" /></td>
                                                <td className="px-2 py-3 text-center"><Count n={summary.leave} color="var(--accent-blue)" /></td>
                                                <td className="px-2 py-3 text-center"><Count n={summary.offset} color="var(--accent-purple)" /></td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        onClick={() => onOpenDtr(user)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-3)] hover:bg-[var(--surface-3-hover)] text-[var(--text-secondary)] text-xs font-bold rounded-lg border border-[var(--border-strong)] transition-colors"
                                                    >
                                                        <FileText size={12} /> DTR
                                                    </button>
                                                </td>
                                            </tr>
                                            {isOpen && (
                                                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                                                    <td colSpan={6} className="px-4 py-5">
                                                        <MonthCalendar days={days} summary={summary} />
                                                    </td>
                                                </tr>
                                            )}
                                        </FragmentRow>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                Late means the first time-in is after 9:00 AM. A working day with no time entry shows as "No entry" and is not counted against anyone.
            </p>
        </div>
    )
}

// A keyed fragment without importing Fragment just for the table rows.
function FragmentRow({ children }) {
    return <>{children}</>
}
