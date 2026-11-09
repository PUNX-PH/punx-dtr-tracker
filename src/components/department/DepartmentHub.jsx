import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Loader2, X } from 'lucide-react'
import { api, calendarApi, holidayApi, leaveApi, orgApi } from '../../services/api'
import { holidaysForYears } from '../../services/holidays'
import { monthBounds, monthGrid } from '../../services/calendar'
import { departmentsInScope, hasScope, isHrOrAdmin, scopeFor, usersInScope } from '../../services/org'
import DTRTable from '../DTRTable'
import DepartmentCalendar from './DepartmentCalendar'
import AttendanceMonitor from './AttendanceMonitor'
import LeaveHistory from './LeaveHistory'
import DepartmentsAdmin from './DepartmentsAdmin'
import PeopleAdmin from './PeopleAdmin'
import HolidaysAdmin from './HolidaysAdmin'
import useMonthAttendance from './useMonthAttendance'
import { ErrorNote, Spinner } from './controls'

const explain = (e, what) => e?.code === 'permission-denied'
    ? `${what}: the latest Firestore rules need to be published first.`
    : `${what}: ${e?.message || 'something went wrong'}`

/**
 * The Department hub: one calendar for the company, plus — depending on who is
 * looking — attendance monitoring, leave history and the org setup.
 *
 *   everyone            Calendar (holidays + approved leave; no reasons)
 *   managers/directors  + Attendance and Leave history for THEIR departments
 *   HR / admin          + the same for the whole company, and Setup
 *
 * The scope (org.js scopeFor) decides what is fetched, and the Firestore rules
 * refuse anything outside it — this component never filters data it should not
 * have been given.
 */
export default function DepartmentHub({ user }) {
    const scope = useMemo(() => scopeFor(user), [user])
    const canSeeTeam = hasScope(scope)
    const isAdmin = isHrOrAdmin(user)

    const now = new Date()
    const [tab, setTab] = useState('calendar')
    const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })
    const [deptFilter, setDeptFilter] = useState('')

    const [departments, setDepartments] = useState([])
    const [storedHolidays, setStoredHolidays] = useState([])
    const [events, setEvents] = useState([])
    const [people, setPeople] = useState([])     // everyone this viewer can see (their scope)
    const [requests, setRequests] = useState([]) // leave requests in scope
    const [ready, setReady] = useState(false)
    const [eventsLoading, setEventsLoading] = useState(false)
    const [error, setError] = useState('')
    const [dtrFor, setDtrFor] = useState(null)   // person whose DTR is open

    const loadStatic = useCallback(async () => {
        try {
            const [depts, hols] = await Promise.all([orgApi.getDepartments(), holidayApi.list()])
            setDepartments(depts)
            setStoredHolidays(hols)
        } catch (e) {
            console.error('Load departments/holidays failed', e)
            setError(explain(e, 'Could not load departments and holidays'))
        }
    }, [])

    const loadTeam = useCallback(async () => {
        if (!canSeeTeam) return
        try {
            const [users, reqs] = await Promise.all([orgApi.getUsersInScope(scope), leaveApi.getRequestsInScope(scope)])
            setPeople(users)
            setRequests(reqs)
        } catch (e) {
            console.error('Load team failed', e)
            setError(explain(e, 'Could not load your team'))
        }
    }, [canSeeTeam, scope])

    useEffect(() => { Promise.all([loadStatic(), loadTeam()]).finally(() => setReady(true)) }, [loadStatic, loadTeam])

    // Approved leave for the month grid, including the neighbouring months' days it shows.
    const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor])
    const loadEvents = useCallback(async () => {
        setEventsLoading(true)
        try {
            setEvents(await calendarApi.getEvents(grid[0].ymd, grid[grid.length - 1].ymd))
            setError(e => (e.startsWith('Could not load the calendar') ? '' : e))
        } catch (e) {
            console.error('Load calendar failed', e)
            setError(explain(e, 'Could not load the calendar'))
        } finally { setEventsLoading(false) }
    }, [grid])
    useEffect(() => { loadEvents() }, [loadEvents])

    // Three years around the month on screen, so a grid that spills into
    // December/January still knows those holidays.
    const holidays = useMemo(
        () => holidaysForYears([cursor.year - 1, cursor.year, cursor.year + 1], storedHolidays),
        [cursor.year, storedHolidays]
    )

    const teamUsers = useMemo(() => usersInScope(scope, people), [scope, people])
    const scopeDepartments = useMemo(() => departmentsInScope(scope, departments), [scope, departments])

    // Everyone's logs for the month — only fetched while the Attendance tab is open.
    const attendance = useMonthAttendance({
        users: teamUsers, year: cursor.year, month: cursor.month,
        leaveEvents: events, holidays, enabled: canSeeTeam && tab === 'attendance',
    })

    const closeDtr = useCallback(() => setDtrFor(null), [])

    const handleSync = async () => {
        const res = await calendarApi.rebuild()
        if (!res.success) { setError(`Could not sync approved leave: ${res.message}`); return }
        await loadEvents()
    }

    const tabs = [
        { id: 'calendar', label: 'Calendar' },
        ...(canSeeTeam ? [{ id: 'attendance', label: 'Attendance' }, { id: 'history', label: 'Leave history' }] : []),
        ...(isAdmin ? [{ id: 'setup', label: 'Setup' }] : []),
    ]

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-[var(--accent-purple)]/10 rounded-xl text-[var(--accent-purple)]"><CalendarDays size={22} /></div>
                <div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">Calendar</h2>
                    <p className="text-[var(--text-muted)] text-sm">
                        {isAdmin ? 'Company-wide calendar, attendance and leave'
                            : canSeeTeam ? 'Calendar, attendance and leave for your departments'
                                : 'Holidays and who is away'}
                    </p>
                </div>
            </div>

            {tabs.length > 1 && (
                <div role="tablist" className="flex items-center gap-2 bg-[var(--surface-1)] rounded-2xl border border-[var(--border)] p-1.5 w-full sm:w-fit overflow-x-auto">
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            role="tab"
                            aria-selected={tab === t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex-1 sm:flex-none whitespace-nowrap px-4 py-2 text-xs font-bold rounded-xl transition-colors
                                ${tab === t.id ? 'bg-[var(--accent-purple)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            )}

            {tab !== 'calendar' && <ErrorNote>{error}</ErrorNote>}

            {!ready ? <Spinner /> : (
                <>
                    {tab === 'calendar' && (
                        <DepartmentCalendar
                            cursor={cursor} onCursor={setCursor}
                            departments={departments} deptFilter={deptFilter} onDeptFilter={setDeptFilter}
                            holidays={holidays} leaveEvents={events}
                            loading={eventsLoading}
                            error={error}
                            canSync={isAdmin} onSync={handleSync}
                        />
                    )}

                    {tab === 'attendance' && canSeeTeam && (
                        <AttendanceMonitor
                            cursor={cursor} onCursor={setCursor}
                            departments={departments} scopeDepartments={scopeDepartments}
                            deptFilter={deptFilter} onDeptFilter={setDeptFilter}
                            rows={attendance.rows} loading={attendance.loading} error={attendance.error}
                            onReload={attendance.reload} onOpenDtr={setDtrFor}
                        />
                    )}

                    {tab === 'history' && canSeeTeam && (
                        <LeaveHistory user={user} requests={requests} users={people} departments={departments} scopeDepartments={scopeDepartments} onChanged={() => { loadTeam(); loadEvents() }} />
                    )}

                    {tab === 'setup' && isAdmin && (
                        <div className="space-y-6">
                            <DepartmentsAdmin departments={departments} users={people} onChanged={async () => { await loadStatic(); await loadTeam() }} />
                            <PeopleAdmin users={people} departments={departments} onChanged={loadTeam} />
                            <HolidaysAdmin stored={storedHolidays} onChanged={loadStatic} />
                        </div>
                    )}
                </>
            )}

            {dtrFor && (
                <DtrViewer
                    person={dtrFor}
                    cursor={cursor}
                    requests={requests.filter(r => r.userId === dtrFor.id)}
                    onClose={closeDtr}
                />
            )}
        </div>
    )
}

/** A person's DTR for the month on screen, read-only. Managers can look; nothing here can write. */
function DtrViewer({ person, cursor, requests, onClose }) {
    const [history, setHistory] = useState(null)
    const [error, setError] = useState('')
    const { start, end } = monthBounds(cursor.year, cursor.month)

    const [y, m, d] = start.split('-').map(Number)
    const [ey, em, ed] = end.split('-').map(Number)

    useEffect(() => {
        let cancelled = false
        // The month on screen, via the query that THROWS: getHistory swallows a
        // permission error into [], which would show a manager an empty DTR and
        // read as "they never clocked in".
        const from = new Date(y, m - 1, d)
        const to = new Date(ey, em - 1, ed, 23, 59, 59, 999)
        api.getLogsBetween(person.id, from, to)
            .then(h => { if (!cancelled) setHistory(h) })
            .catch(e => { if (!cancelled) setError(explain(e, 'Could not load this DTR')) })
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => { cancelled = true; window.removeEventListener('keydown', onKey) }
    }, [person.id, y, m, d, ey, em, ed, onClose])

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-2 sm:p-6 overflow-y-auto" role="dialog" aria-modal="true" aria-label={`DTR for ${person.name || person.email}`} onClick={onClose}>
            <div className="w-full max-w-6xl bg-[var(--surface-0)] border border-[var(--border)] rounded-3xl p-4 sm:p-6 space-y-4 my-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-bold text-[var(--text-primary)]">{person.name || person.email}</h3>
                        <p className="text-xs text-[var(--text-muted)]">Daily time record · view only</p>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)]"><X size={18} /></button>
                </div>
                <ErrorNote>{error}</ErrorNote>
                {!history && !error ? (
                    <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[var(--accent-purple)]" size={28} /></div>
                ) : history && (
                    <DTRTable
                        user={person}
                        history={history}
                        leaves={requests}
                        canEdit={false}
                        onRefresh={() => {}}
                        initialDate={new Date(y, m - 1, d)}
                        periodEnd={new Date(ey, em - 1, ed)}
                    />
                )}
            </div>
        </div>
    )
}
