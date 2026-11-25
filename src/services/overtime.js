// Overtime → offset. Pure, so the rule is one tested function instead of
// arithmetic scattered through screens (tests/overtime.test.mjs).
//
// THE RULE (what the Info dialog on Leave & Offset tells people — it reads the
// constants below, so the text and the maths cannot disagree):
//   • OT is counted per CUTOFF, from the OT_IN / OT_OUT pairs on the DTR. The
//     counter starts again at zero with every new cutoff.
//   • Only time OUTSIDE regular hours (9:00 AM – 6:00 PM on a working day) is
//     overtime. A session that overlaps regular hours counts only the part
//     outside them; on weekends and holidays all of it counts (workday.js).
//   • The first OT_THRESHOLD_HOURS (20) of a cutoff stay ordinary overtime.
//   • Every hour past that becomes offset, 1 hour of OT = 1 hour of offset.
//   • It is credited when the cutoff's DTR is APPROVED, as a snapshot stored on
//     the submission — not recalculated later, because people can edit their own
//     logs after approval.
//   • There is no cap on offset. Super admins get a warning once someone's
//     remaining offset passes OFFSET_WARN_HOURS (30); the excess still counts.

import { parseYMD, toYMD } from './leave.js'
import { MAX_OT_SESSION_HOURS, workOverlapMinutes, actualMinutes, makeDayKind } from './workday.js'
import { otSessions, classifyOT, regularEndFn } from './otTypes.js'

export { MAX_OT_SESSION_HOURS }

export const OT_THRESHOLD_HOURS = 20
export const OFFSET_WARN_HOURS = 30

const round2 = (n) => Math.round(n * 100) / 100

/**
 * Overtime from raw logs. A session is an OT_IN and an OT_OUT with the same local
 * calendar day and session number (a day can have several — "split OT").
 *
 *   opts.dayKind    (Date) => 'work' | 'rest' | 'regularHoliday' | 'specialHoliday',
 *                   from workday.makeDayKind(holidays). Callers that know the
 *                   holidays should pass it; without it only weekends have no
 *                   regular hours.
 *   opts.isWorkday  older form of the same thing: (Date) => boolean.
 *
 * What counts, per session: the minutes OUTSIDE regular hours (9–6 on a working
 * day), less 1 hour for the break when that is longer than 5 hours
 * (workday.actualMinutes). 6:00 PM → 2:00 AM is 8 hours elapsed, 7 counted.
 *
 * Returns { hours, minutes, sessions, skipped, incomplete, overlaps, noReason, byDay, types }:
 *   hours     total of the counted sessions (2 decimals)
 *   minutes   the same total in whole minutes — what "X hrs Y mins" is built from
 *   sessions  how many sessions added anything to the total
 *   skipped   sessions with an IN but no OUT (or the reverse), or an OUT that
 *             can't be made sense of. They count for nothing rather than guessing.
 *             An OUT earlier than the IN is an OVERNIGHT session (6 PM → 2:13 AM:
 *             the OUT is the next morning) as long as that comes to no more than
 *             MAX_OT_SESSION_HOURS; past that it is almost certainly a mistyped
 *             AM/PM and is reported as 'bad-order'.
 *   incomplete  WHICH sessions were skipped, so a reviewer can go and look:
 *               [{ day:'YYYY-MM-DD', session, problem, inAt, outAt }] where problem
 *               is 'no-end', 'no-start' or 'bad-order'
 *   overlaps  sessions that run into regular hours on a working day. Only the part
 *             OUTSIDE 9–6 is counted; this says how much was left out:
 *             [{ day, session, inAt, outAt, overlapMinutes, countedMinutes }]
 *   noReason  sessions with no reason written for them (the otReason on their
 *             logs): [{ day, session }]
 *   byDay     { 'YYYY-MM-DD': minutes } — each day's counted overtime
 *   types     the same hours sorted into the DTR guidelines' types — Regular OT,
 *             Rest Day Work, Holiday OT, … with ND carved out: classifyOT()
 */
export function otHoursFromLogs(logs = [], opts = {}) {
    const dayKind = opts.dayKind || (opts.isWorkday ? (d) => (opts.isWorkday(d) ? 'work' : 'rest') : makeDayKind())
    const isWorkday = (d) => dayKind(d) === 'work'
    const workEnd = regularEndFn(logs) // regular time that ran past 6:00 PM is not overtime

    let minutes = 0
    let sessions = 0
    const incomplete = []
    const overlaps = []
    const noReason = []
    const byDay = {}
    for (const s of otSessions(logs)) {
        const { day, session, inAt, outAt } = s
        if (!s.reason) noReason.push({ day, session })
        if (s.problem) { incomplete.push({ day, session, problem: s.problem, inAt, outAt }); continue }

        // Only the part outside regular hours is overtime, less the break.
        const end = new Date(inAt.getTime() + s.elapsed * 60000)
        const overlapMinutes = workOverlapMinutes(inAt, end, isWorkday, workEnd)
        const counted = actualMinutes(inAt, end, isWorkday, workEnd).minutes.length
        if (overlapMinutes > 0) overlaps.push({ day, session, inAt, outAt, overlapMinutes, countedMinutes: counted })
        if (counted > 0) {
            minutes += counted
            byDay[day] = (byDay[day] || 0) + counted
            sessions++
        }
    }
    return {
        hours: round2(minutes / 60), minutes, sessions, skipped: incomplete.length,
        incomplete, overlaps, noReason, byDay,
        types: classifyOT(logs, { dayKind }),
    }
}

/**
 * Overtime for the period a DTR is showing: only logs inside the cutoff's days
 * when there is one, else everything given. Adds `window` (or null).
 */
export function otForPeriod(logs = [], cutoff = null, opts = {}) {
    if (!cutoff) return { ...otHoursFromLogs(logs, opts), window: null }
    const win = cutoffWindow(cutoff)
    const inside = logs.filter(l => {
        const t = new Date(l.timestamp)
        return t >= win.from && t <= win.to
    })
    return { ...otHoursFromLogs(inside, opts), window: win }
}

/** 1590 → "26 hrs 30 mins"; 60 → "1 hr"; 61 → "1 hr 1 min"; 0 → "0 mins". */
export function formatDuration(totalMinutes) {
    const m = Math.max(0, Math.round(Number(totalMinutes) || 0))
    const h = Math.floor(m / 60)
    const r = m % 60
    const parts = []
    if (h > 0) parts.push(`${h} hr${h === 1 ? '' : 's'}`)
    if (r > 0 || h === 0) parts.push(`${r} min${r === 1 ? '' : 's'}`)
    return parts.join(' ')
}

/** { kept, excess }: what stays overtime and what becomes offset. */
export function splitOT(hours, threshold = OT_THRESHOLD_HOURS) {
    const h = Math.max(0, Number(hours) || 0)
    return { kept: round2(Math.min(h, threshold)), excess: round2(Math.max(0, h - threshold)) }
}

/**
 * The calendar days a cutoff covers, as local Dates (start 00:00 → end 23:59:59.999).
 * Cutoff dates are Firestore Timestamps whose LOCAL date is the day meant — the
 * DTR table builds its rows from the same local days — so the window must be too.
 */
export function cutoffWindow(cutoff) {
    const startYMD = toYMD(cutoff.startDate.toDate())
    const endYMD = toYMD(cutoff.endDate.toDate())
    const from = parseYMD(startYMD)
    const to = parseYMD(endYMD)
    to.setHours(23, 59, 59, 999)
    return { from, to, startYMD, endYMD }
}

/** Offset hours earned from OT: only cutoffs whose DTR is approved count. { [userId]: hours } */
export function offsetEarnedByUser(submissions) {
    const out = {}
    for (const s of submissions) {
        if (s.status !== 'approved') continue
        const n = Number(s.offsetEarned)
        if (Number.isFinite(n) && n > 0) out[s.userId] = round2((out[s.userId] || 0) + n)
    }
    return out
}

/** Should a super admin be warned about this much remaining offset? No cap — a flag only. */
export const offsetOverWarning = (remainingHours) => Number(remainingHours) > OFFSET_WARN_HOURS
