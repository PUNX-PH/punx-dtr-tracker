import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FileText, Loader2, RefreshCw, Search } from 'lucide-react'
import { DAY_STATUS, summarizeDays } from '../../services/attendance'
import { formatYMD } from '../../services/leave'
import { departmentName } from '../../services/org'
import { DepartmentSelect, ErrorNote, MONTH_NAMES, MonthSwitcher } from './controls'

const SORTS = {
    name: { label: 'Name', fn: (a, b) => (a.user.name || '').localeCompare(b.user.name || '') },
    absent: { label: 'Most absences', fn: (a, b) => b.summary.absent - a.summary.absent || (a.user.name || '').localeCompare(b.user.name || '') },
    late: { label: 'Most late', fn: (a, b) => b.summary.late - a.summary.late || (a.user.name || '').localeCompare(b.user.name || '') },
    rate: { label: 'Lowest attendance', fn: (a, b) => (a.summary.attendanceRate ?? 101) - (b.summary.attendanceRate ?? 101) },
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

/** One person's month as a strip of coloured days. Weekends are drawn faint so the working days read. */
function DayStrip({ days }) {
    return (
        <div className="flex flex-wrap gap-1" role="list" aria-label="Day by day">
            {days.map(d => {
                const s = DAY_STATUS[d.status]
                const quiet = ['weekend', 'upcoming', 'untracked'].includes(d.status)
                const detail = d.holiday ? ` — ${d.holiday.name}` : d.leave ? ` — ${d.leave.type === 'offset' ? 'Offset' : 'Leave'}` : ''
                return (
                    <span
                        key={d.ymd}
                        role="listitem"
                        title={`${formatYMD(d.ymd)}: ${s.label}${detail}`}
                        aria-label={`${formatYMD(d.ymd)}: ${s.label}`}
                        className={`w-7 h-7 rounded-md flex items-center justify-center text-[9px] font-bold ${quiet ? 'opacity-50' : ''}`}
                        style={{ color: s.color, background: quiet ? 'var(--surface-3)' : tint(s.color) }}
                    >
                        {d.ymd.slice(8)}
                    </span>
                )
            })}
        </div>
    )
}

/**
 * Attendance monitoring for the people a viewer manages (or everyone, for HR).
 * The numbers come from attendance.js — see its header for what "late" and
 * "absent" mean — so this screen only presents them.
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

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <Stat label="Attendance rate" value={totals.attendanceRate === null ? '—' : `${totals.attendanceRate}%`} color="var(--accent-green)" />
                <Stat label="Days attended" value={totals.attended} />
                <Stat label="Late arrivals" value={totals.late} color="var(--accent-amber)" />
                <Stat label="Absences" value={totals.absent} color="var(--accent-red)" />
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
                                    <th scope="col" className="px-2 py-3 text-center">Absent</th>
                                    <th scope="col" className="px-2 py-3 text-center">Leave</th>
                                    <th scope="col" className="px-2 py-3 text-center">Offset</th>
                                    <th scope="col" className="px-2 py-3 text-center">Rate</th>
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
                                                <td className="px-2 py-3 text-center"><Count n={summary.absent} color="var(--accent-red)" /></td>
                                                <td className="px-2 py-3 text-center"><Count n={summary.leave} color="var(--accent-blue)" /></td>
                                                <td className="px-2 py-3 text-center"><Count n={summary.offset} color="var(--accent-purple)" /></td>
                                                <td className="px-2 py-3 text-center font-mono text-xs text-[var(--text-secondary)]">{summary.attendanceRate === null ? '—' : `${summary.attendanceRate}%`}</td>
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
                                                    <td colSpan={8} className="px-4 py-4">
                                                        <DayStrip days={days} />
                                                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[10px] font-semibold text-[var(--text-muted)]">
                                                            {['present', 'late', 'absent', 'leave', 'offset', 'holiday'].map(k => (
                                                                <span key={k} className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: DAY_STATUS[k].color }} />{DAY_STATUS[k].label}</span>
                                                            ))}
                                                        </div>
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
                Late means the first time-in is after 9:00 AM. Absent means a finished working day with no time entry, no approved leave and no holiday.
                Today is never counted as absent, and nothing counts before a person's start date.
            </p>
        </div>
    )
}

// A keyed fragment without importing Fragment just for the table rows.
function FragmentRow({ children }) {
    return <>{children}</>
}
