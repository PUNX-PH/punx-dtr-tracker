import { useMemo, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { HOLIDAY_TYPES, holidaysByDate } from '../../services/holidays'
import { WEEKDAY_LABELS, eventsForDate, inDepartment, leaveTag, monthGrid } from '../../services/calendar'
import { LEAVE_TYPES, formatYMD, toYMD } from '../../services/leave'
import { departmentName } from '../../services/org'
import { MONTH_NAMES, MonthSwitcher, DepartmentSelect, ErrorNote } from './controls'

const tint = (color, pct = 14) => `color-mix(in srgb, ${color} ${pct}%, transparent)`
const MAX_CHIPS = 3

// Holidays are drawn SOLID and people's leave TINTED, so a holiday can never be
// mistaken for someone's leave even where their hues sit close together. The
// text on a solid chip is the page surface colour, which flips with the theme and
// so stays readable on both the light and the dark version of every hue.
function Chip({ color, children, title, solid = false }) {
    return (
        <span
            title={title}
            className="block truncate rounded px-1.5 py-0.5 text-[10px] leading-4 font-semibold"
            style={solid ? { color: 'var(--surface-1)', background: color } : { color, background: tint(color) }}
        >
            {children}
        </span>
    )
}

/**
 * The company calendar: Philippine and company holidays, and approved leave and
 * offsets for everyone. Approved leave arrives as reason-free calendarEvents, so
 * nothing private can be drawn from here.
 */
export default function DepartmentCalendar({
    cursor, onCursor, departments, deptFilter, onDeptFilter,
    holidays, leaveEvents, loading = false, error = '',
    canSync = false, onSync,
}) {
    const [selected, setSelected] = useState(toYMD(new Date()))
    const [syncing, setSyncing] = useState(false)

    const today = toYMD(new Date())
    const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor])
    const holidayIndex = useMemo(() => holidaysByDate(holidays), [holidays])

    const filteredLeaves = useMemo(() => leaveEvents.filter(inDepartment(deptFilter)), [leaveEvents, deptFilter])

    const dayEvents = (ymd) => eventsForDate(ymd, { holidaysByDate: holidayIndex, leaves: filteredLeaves })
    const detail = dayEvents(selected)

    const upcoming = useMemo(
        () => holidays.filter(h => h.date >= today).slice(0, 5),
        [holidays, today]
    )

    const handleSync = async () => {
        setSyncing(true)
        try { await onSync?.() } finally { setSyncing(false) }
    }

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3">
                <MonthSwitcher cursor={cursor} onCursor={onCursor} onToday={(d) => setSelected(toYMD(d))} />
                <DepartmentSelect departments={departments} value={deptFilter} onChange={onDeptFilter} />
                {loading && <Loader2 size={16} className="animate-spin text-[var(--accent-purple)]" aria-label="Loading" />}
                {canSync && (
                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        title="Create calendar entries for leave that was approved before the calendar existed"
                        className="ml-auto flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 transition-colors"
                    >
                        <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> Sync approved leave
                    </button>
                )}
            </div>

            <ErrorNote>{error}</ErrorNote>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem] gap-4 items-start">
                {/* Month grid */}
                <section aria-label={`${MONTH_NAMES[cursor.month]} ${cursor.year}`} className="bg-[var(--surface-1)] border border-[var(--border)] rounded-3xl overflow-hidden">
                    <div className="grid grid-cols-7 border-b border-[var(--border)]">
                        {WEEKDAY_LABELS.map(d => (
                            <div key={d} className="py-2 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{d}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7">
                        {grid.map((cell, i) => {
                            const ev = dayEvents(cell.ymd)
                            const items = [
                                ...ev.holidays.map(h => ({ key: `h${h.id}`, color: HOLIDAY_TYPES[h.type].color, text: h.name, solid: true, title: `${h.name} — ${HOLIDAY_TYPES[h.type].label}` })),
                                ...ev.leaves.map(l => ({ key: `l${l.id}`, color: LEAVE_TYPES[l.type].color, text: `${l.userName} · ${leaveTag(l.type)}`, title: `${l.userName} — ${LEAVE_TYPES[l.type].label}` })),
                            ]
                            const isSelected = selected === cell.ymd
                            const isToday = cell.ymd === today
                            const weekend = i % 7 === 0 || i % 7 === 6
                            return (
                                <button
                                    key={cell.ymd}
                                    onClick={() => setSelected(cell.ymd)}
                                    aria-label={`${formatYMD(cell.ymd)}${items.length ? `, ${items.length} item${items.length === 1 ? '' : 's'}` : ''}`}
                                    aria-pressed={isSelected}
                                    className={`min-h-[3.5rem] sm:min-h-[6.5rem] p-1 sm:p-1.5 text-left border-b border-r border-[var(--border)] align-top flex flex-col gap-1 transition-colors
                                        ${cell.inMonth ? '' : 'opacity-40'}
                                        ${weekend ? 'bg-[var(--surface-2)]' : ''}
                                        ${isSelected ? 'ring-2 ring-inset ring-[var(--accent-purple)]' : 'hover:bg-[var(--surface-3)]'}`}
                                >
                                    <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-[var(--accent-purple)] text-white' : 'text-[var(--text-secondary)]'}`}>
                                        {cell.day}
                                    </span>
                                    {/* Chips from sm up; dots below it, where a cell is too narrow for text. */}
                                    <span className="hidden sm:flex flex-col gap-0.5 w-full min-w-0">
                                        {items.slice(0, MAX_CHIPS).map(it => <Chip key={it.key} color={it.color} title={it.title} solid={it.solid}>{it.text}</Chip>)}
                                        {items.length > MAX_CHIPS && <span className="text-[10px] font-semibold text-[var(--text-muted)] px-1">+{items.length - MAX_CHIPS} more</span>}
                                    </span>
                                    <span className="flex sm:hidden flex-wrap gap-0.5 px-0.5">
                                        {items.slice(0, 6).map(it => <span key={it.key} className={`w-1.5 h-1.5 ${it.solid ? 'rounded-[2px]' : 'rounded-full'}`} style={{ background: it.color }} />)}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </section>

                {/* Side panel: the selected day, then what is coming up */}
                <div className="space-y-4">
                    <section aria-live="polite" className="bg-[var(--surface-1)] border border-[var(--border)] rounded-3xl p-4 sm:p-5">
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">{formatYMD(selected)}</h3>
                        {detail.holidays.length + detail.leaves.length === 0 ? (
                            <p className="text-sm text-[var(--text-muted)] mt-3">Nothing scheduled.</p>
                        ) : (
                            <div className="mt-3 space-y-4">
                                {detail.holidays.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Holidays</p>
                                        <ul className="space-y-1.5">
                                            {detail.holidays.map(h => (
                                                <li key={h.id} className="flex items-center justify-between gap-2 text-sm">
                                                    <span className="text-[var(--text-primary)] min-w-0 truncate">{h.name}</span>
                                                    <span className="text-[10px] font-bold uppercase shrink-0" style={{ color: HOLIDAY_TYPES[h.type].color }}>{HOLIDAY_TYPES[h.type].short}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {detail.leaves.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">On leave ({detail.leaves.length})</p>
                                        <ul className="space-y-1.5">
                                            {detail.leaves.map(l => (
                                                <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                                                    <span className="min-w-0">
                                                        <span className="text-[var(--text-primary)] block truncate">{l.userName}</span>
                                                        <span className="text-[10px] text-[var(--text-muted)] block truncate">{departmentName(departments, l.departmentId)}</span>
                                                    </span>
                                                    <span className="text-[10px] font-bold uppercase shrink-0" style={{ color: LEAVE_TYPES[l.type].color }}>
                                                        {l.type === 'offset' ? `Offset · ${l.hours}h` : LEAVE_TYPES[l.type].label}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </section>

                    <section className="bg-[var(--surface-1)] border border-[var(--border)] rounded-3xl p-4 sm:p-5">
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">Upcoming holidays</h3>
                        {upcoming.length === 0 ? (
                            <p className="text-sm text-[var(--text-muted)] mt-3">None left this year.</p>
                        ) : (
                            <ul className="mt-3 space-y-2">
                                {upcoming.map(h => (
                                    <li key={h.id}>
                                        <button onClick={() => { const [y, m] = h.date.split('-').map(Number); onCursor({ year: y, month: m - 1 }); setSelected(h.date) }} className="w-full flex items-center justify-between gap-2 text-left text-sm hover:text-[var(--accent-purple)] transition-colors">
                                            <span className="min-w-0 truncate text-[var(--text-primary)]">{h.name}</span>
                                            <span className="text-xs text-[var(--text-muted)] shrink-0">{formatYMD(h.date).replace(/ \d{4}$/, '')}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* Legend */}
                    <section aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1.5 px-1 text-[10px] font-semibold text-[var(--text-muted)]">
                        {Object.values(HOLIDAY_TYPES).map(t => <span key={t.label} className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-[2px]" style={{ background: t.color }} />{t.short} holiday</span>)}
                        {Object.values(LEAVE_TYPES).map(t => <span key={t.label} className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: t.color }} />{t.label}</span>)}
                    </section>
                </div>
            </div>
        </div>
    )
}
