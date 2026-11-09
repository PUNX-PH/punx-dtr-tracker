import { useEffect, useMemo, useState } from 'react'
import { api } from '../../services/api'
import { classifyRange, summarizeDays } from '../../services/attendance'
import { holidaysByDate as indexHolidays } from '../../services/holidays'
import { monthBounds } from '../../services/calendar'
import { parseYMD, toYMD } from '../../services/leave'

// Logs for a few people at a time — a company-wide month is one query per
// person, and firing them all at once would be a burst of reads for no benefit.
const CONCURRENCY = 6

async function inChunks(items, size, fn) {
    const out = []
    for (let i = 0; i < items.length; i += size) {
        out.push(...await Promise.all(items.slice(i, i + size).map(fn)))
    }
    return out
}

/**
 * A month of attendance for everyone in `users`: raw logs are fetched once per
 * (people, month), and the classification — which depends on holidays and
 * approved leave, and so changes without a refetch — is derived from them.
 *
 *   rows: [{ user, days: [{ ymd, status, leave, holiday }], summary }]
 *
 * `enabled` false skips the fetch entirely (an employee never loads anyone's
 * logs; the rules would refuse it anyway).
 */
export default function useMonthAttendance({ users, year, month, leaveEvents, holidays, enabled = true }) {
    const [logsByUser, setLogsByUser] = useState({})
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [nonce, setNonce] = useState(0)
    // Which (people, month) the logs in state belong to. Rows are only built once
    // it matches what is being asked for — before that, every day would classify
    // as "no entry" for a split second, which is a false report, not a loading state.
    const [loadedFor, setLoadedFor] = useState('')

    const idsKey = users.map(u => u.id).sort().join(',')
    const wantKey = `${idsKey}|${year}-${month}`

    useEffect(() => {
        if (!enabled || users.length === 0) { setLogsByUser({}); setLoadedFor(wantKey); setLoading(false); return }
        let cancelled = false
        setLoading(true)
        setError('')
        const { start, end } = monthBounds(year, month)
        const from = parseYMD(start)
        const to = parseYMD(end)
        to.setHours(23, 59, 59, 999)

        inChunks(users, CONCURRENCY, async (u) => [u.id, await api.getLogsBetween(u.id, from, to)])
            .then(entries => { if (!cancelled) { setLogsByUser(Object.fromEntries(entries)); setLoadedFor(wantKey) } })
            .catch(e => {
                console.error('Load attendance failed', e)
                if (!cancelled) setError(e.code === 'permission-denied'
                    ? "You aren't allowed to see some of these DTRs. The latest Firestore rules need to be published."
                    : `Could not load attendance: ${e.message}`)
            })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
        // idsKey stands in for `users`: a new array with the same people is not a reason to refetch.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idsKey, year, month, enabled, nonce])

    const rows = useMemo(() => {
        if (!enabled || loadedFor !== wantKey) return []
        const { start, end } = monthBounds(year, month)
        const today = toYMD(new Date())
        const byDate = indexHolidays(holidays)
        // Events exist only for approved leave; classifyRange wants request-shaped rows.
        const approved = leaveEvents.map(e => ({ ...e, status: 'approved' }))
        return users.map(user => {
            const days = classifyRange({
                startYMD: start, endYMD: end,
                logs: logsByUser[user.id] || [],
                leaves: approved.filter(e => e.userId === user.id),
                holidaysByDate: byDate, today,
            })
            return { user, days, summary: summarizeDays(days) }
        })
    }, [enabled, loadedFor, wantKey, users, year, month, logsByUser, leaveEvents, holidays])

    return { rows, loading, error, reload: () => setNonce(n => n + 1) }
}
