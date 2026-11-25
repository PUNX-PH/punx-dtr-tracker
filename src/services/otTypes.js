// OT types — what kind of work and overtime each hour was, per the DTR
// guidelines. Pure (tests/otTypes.test.mjs).
//
//   Workday (Mon–Fri, not a holiday)
//     Regular OT            overtime outside 9–6 that is not in the ND window
//     Regular OT with ND    overtime that falls between 10:00 PM and 6:00 AM
//   Rest day (Saturday/Sunday, or a company holiday paid as a rest day)
//     Rest Day Work         the first 8 actual hours worked that day
//     Rest Day OT           actual hours past 8
//     Rest Day OT with ND   the part of that OT inside the ND window
//   Regular Holiday / Special Holiday
//     … Work                the first 8 actual hours
//     … OT                  actual hours past 8
//     … Work/OT with ND     any holiday hours inside the ND window
//
// "Actual hours" = time worked with the break taken off: one continuous stretch
// longer than 5 hours loses 1 hour (workday.actualMinutes). On a rest day or
// holiday everything worked that day — the regular Time In/Out AND any OT
// sessions — is added together before the first 8 hours are called Work.
// ND is carved OUT of the other lines, never added on top: 3 hours Regular OT +
// 4 hours with ND is 7 hours of overtime, not 11.
//
// A session belongs to the day it STARTED on, which is the row it is on in the DTR.

import { toYMD, parseYMD } from './leave.js'
import { MAX_OT_SESSION_HOURS, FULL_DAY_MIN, WORK_END_MIN, actualMinutes, inND, makeDayKind } from './workday.js'

/** The lines of the breakdown, in the order the guidelines list them. */
export const OT_TYPE_LINES = [
    ['regularOT', 'Regular OT'],
    ['regularOTND', 'Regular OT with ND'],
    ['restDayWork', 'Rest Day Work'],
    ['restDayOT', 'Rest Day OT'],
    ['restDayOTND', 'Rest Day OT with ND'],
    ['regularHolidayWork', 'Regular Holiday Work'],
    ['regularHolidayOT', 'Regular Holiday OT'],
    ['regularHolidayND', 'Regular Holiday Work/OT with ND'],
    ['specialHolidayWork', 'Special Holiday Work'],
    ['specialHolidayOT', 'Special Holiday OT'],
    ['specialHolidayND', 'Special Holiday Work/OT with ND'],
]

const emptyBuckets = () => Object.fromEntries(OT_TYPE_LINES.map(([k]) => [k, 0]))

const asDate = (ts) => (ts instanceof Date ? ts : new Date(ts))

/**
 * OT sessions from raw logs: an OT_IN and an OT_OUT with the same local calendar
 * day and session number (a day can have several — "split OT").
 * [{ day, session, inAt, outAt, elapsed, problem, reason }] sorted by day, session:
 *   elapsed  minutes from IN to OUT; an OUT at or before the IN is an OVERNIGHT
 *            session (it ends the next morning), 0 when either end is missing
 *   problem  null, or 'no-start' / 'no-end' / 'bad-order' (longer than
 *            MAX_OT_SESSION_HOURS — a mistyped AM/PM, not an overnight)
 *   reason   the session's otReason; failing that the day's Notes, which is where
 *            people wrote the reason before each OT had its own box; '' if neither
 */
export function otSessions(logs = []) {
    const groups = new Map()
    for (const log of logs) {
        if (log.type !== 'OT_IN' && log.type !== 'OT_OUT') continue
        const ts = asDate(log.timestamp)
        if (Number.isNaN(ts.getTime())) continue
        const key = `${toYMD(ts)}_${log.session || 0}`
        const g = groups.get(key) || { ins: [], outs: [], reason: '', note: '' }
        ;(log.type === 'OT_IN' ? g.ins : g.outs).push(ts)
        if (String(log.otReason || '').trim()) g.reason = String(log.otReason).trim()
        if (String(log.reason || '').trim()) g.note = String(log.reason).trim()
        groups.set(key, g)
    }
    const out = []
    for (const [key, g] of groups) {
        const [day, session] = key.split('_')
        const inAt = g.ins.length ? new Date(Math.min(...g.ins)) : null
        const outAt = g.outs.length ? new Date(Math.max(...g.outs)) : null
        let elapsed = inAt && outAt ? Math.round((outAt - inAt) / 60000) : 0
        if (inAt && outAt && elapsed <= 0) elapsed += 24 * 60
        const problem = !inAt ? 'no-start' : !outAt ? 'no-end' : (elapsed <= 0 || elapsed > MAX_OT_SESSION_HOURS * 60) ? 'bad-order' : null
        out.push({ day, session: Number(session), inAt, outAt, elapsed: problem ? 0 : elapsed, problem, reason: g.reason || g.note })
    }
    return out.sort((a, b) => a.day.localeCompare(b.day) || a.session - b.session)
}

/** The regular Time In / Time Out of each day: { 'YYYY-MM-DD': { inAt, outAt } }, only when both are there and sensible. */
function regularBlocks(logs) {
    const days = new Map()
    for (const log of logs) {
        if (log.type !== 'IN' && log.type !== 'OUT') continue
        const ts = asDate(log.timestamp)
        if (Number.isNaN(ts.getTime())) continue
        const day = toYMD(ts)
        const g = days.get(day) || { ins: [], outs: [] }
        ;(log.type === 'IN' ? g.ins : g.outs).push(ts)
        days.set(day, g)
    }
    const out = {}
    for (const [day, g] of days) {
        if (!g.ins.length || !g.outs.length) continue
        const inAt = new Date(Math.min(...g.ins))
        const outAt = new Date(Math.max(...g.outs))
        if (outAt > inAt) out[day] = { inAt, outAt }
    }
    return out
}

/**
 * When each day's regular time ENDED, where that is later than 6:00 PM:
 * (Date) => minute of the day, or 0. Someone who works to 6:30 and logs a Time
 * out of 6:30 has done regular work until then, which is not overtime.
 */
export function regularEndFn(logs = []) {
    const ends = {}
    for (const [day, b] of Object.entries(regularBlocks(logs))) {
        const m = b.outAt.getHours() * 60 + b.outAt.getMinutes()
        if (m > WORK_END_MIN) ends[day] = m
    }
    return (date) => ends[toYMD(date)] || 0
}

/**
 * Sorts the hours in `logs` into the OT types.
 *   opts.dayKind  (Date) => 'work' | 'rest' | 'regularHoliday' | 'specialHoliday',
 *                 from workday.makeDayKind(holidays). Weekends only if omitted.
 * Returns { minutes: { regularOT, regularOTND, … }, total } — every line in
 * minutes, and `total` their sum. Incomplete sessions (no start / no end / a
 * mistyped AM/PM) are left out, exactly as they are from the OT total.
 */
export function classifyOT(logs = [], { dayKind } = {}) {
    const kindOf = dayKind || makeDayKind()
    const isWork = (d) => kindOf(d) === 'work'
    const workEnd = regularEndFn(logs)
    const minutes = emptyBuckets()

    const sessions = otSessions(logs).filter(s => !s.problem)
    const blocks = regularBlocks(logs)
    const days = new Set([...sessions.map(s => s.day), ...Object.keys(blocks)])

    for (const day of [...days].sort()) {
        const kind = kindOf(parseYMD(day))
        const daySessions = sessions.filter(s => s.day === day)

        if (kind === 'work') {
            // Only overtime matters on a workday; the regular Time In/Out is just the day.
            for (const s of daySessions) {
                const end = new Date(s.inAt.getTime() + s.elapsed * 60000)
                for (const t of actualMinutes(s.inAt, end, isWork, workEnd).minutes) {
                    minutes[inND(new Date(t)) ? 'regularOTND' : 'regularOT']++
                }
            }
            continue
        }

        // Rest day or holiday: add up everything worked, then the first 8 hours are Work.
        const worked = new Set()
        const noClip = () => false
        if (blocks[day]) for (const t of actualMinutes(blocks[day].inAt, blocks[day].outAt, noClip).minutes) worked.add(t)
        for (const s of daySessions) {
            const end = new Date(s.inAt.getTime() + s.elapsed * 60000)
            for (const t of actualMinutes(s.inAt, end, noClip).minutes) worked.add(t)
        }
        const prefix = kind === 'rest' ? 'restDay' : kind === 'regularHoliday' ? 'regularHoliday' : 'specialHoliday'
        ;[...worked].sort((a, b) => a - b).forEach((t, rank) => {
            const nd = inND(new Date(t))
            const firstEight = rank < FULL_DAY_MIN
            if (prefix === 'restDay') {
                minutes[firstEight ? 'restDayWork' : nd ? 'restDayOTND' : 'restDayOT']++
            } else if (nd) {
                minutes[`${prefix}ND`]++
            } else {
                minutes[firstEight ? `${prefix}Work` : `${prefix}OT`]++
            }
        })
    }

    return { minutes, total: Object.values(minutes).reduce((a, b) => a + b, 0) }
}

/** The non-empty lines, in guideline order: [{ key, label, minutes }]. */
export function typeLines(types) {
    const m = types?.minutes || {}
    return OT_TYPE_LINES.map(([key, label]) => ({ key, label, minutes: m[key] || 0 })).filter(l => l.minutes > 0)
}
