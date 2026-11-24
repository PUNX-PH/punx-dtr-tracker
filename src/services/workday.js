// The regular working day, and what counts as overtime against it. Pure, so the
// DTR screen, the approval snapshot, the Excel export and the tests all use the
// same answer (tests/workday.test.mjs).
//
//   Regular hours are 9:00 AM – 6:00 PM, Monday to Friday, except holidays.
//   Overtime is time OUTSIDE that: before 9:00 AM or after 6:00 PM on a working
//   day, and any time at all on a rest day or holiday (there are no regular
//   hours to overlap). OT typed inside regular hours is not overtime — it is
//   refused when someone saves it, and left out of the count if it is already
//   there.
//
//   Two more rules come from the DTR guidelines:
//     • BREAK: one continuous stretch of work longer than 5 hours has 1 hour
//       taken off for the break. The DTR doesn't record when the break was, so it
//       is assumed to fall BEFORE the night-differential hours: it comes off the
//       earliest non-ND minutes first, so ND hours stay whole.
//     • ND (night differential) is the clock window 10:00 PM – 6:00 AM.

import { toYMD } from './leave.js'

export const WORK_START_MIN = 9 * 60 // 9:00 AM
export const WORK_END_MIN = 18 * 60 // 6:00 PM
export const WORK_HOURS_TEXT = '9:00 AM – 6:00 PM'

export const ND_START_MIN = 22 * 60 // 10:00 PM
export const ND_END_MIN = 6 * 60 // 6:00 AM
export const BREAK_AFTER_MIN = 5 * 60 // a stretch must be LONGER than 5 hours …
export const BREAK_MIN = 60 // … to lose an hour
export const FULL_DAY_MIN = 8 * 60 // the first 8 actual hours on a rest day / holiday are "work", past that is OT

// The longest single OT session accepted. It is what lets an overnight session
// (6 PM → 2 AM, both typed on the same row) count as 8 hours, while a mistyped
// AM/PM (9 PM → 7 PM would be 22 hours) is still flagged instead of counted.
export const MAX_OT_SESSION_HOURS = 16

/**
 * What KIND of day a date is, for pay purposes:
 *   'work'             Monday–Friday, not a holiday
 *   'rest'             Saturday or Sunday (everyone's rest days), or a company
 *                      holiday its super admin set to be paid as a rest day
 *   'regularHoliday'   a Regular Holiday, or a company holiday set to count as one
 *   'specialHoliday'   a Special Non-Working Day, or a company holiday set to count as one
 * A holiday beats a rest day (a Regular Holiday on a Saturday is a holiday).
 *
 * `holidayYMDs` is anything keyed by 'YYYY-MM-DD' (the object holidaysByDate()
 * returns, a Set is also fine). A holiday we can't tell the kind of counts as a rest day.
 */
export function makeDayKind(holidayYMDs = null) {
    const lookup = !holidayYMDs ? () => null
        : typeof holidayYMDs.has === 'function' ? (k) => (holidayYMDs.has(k) ? [{}] : null)
        : (k) => {
            const v = holidayYMDs[k]
            return Array.isArray(v) ? v : v ? [{}] : null
        }
    const kindOfHoliday = (h) => {
        const as = h.type === 'company' ? h.payAs : h.type
        if (as === 'regular') return 'regularHoliday'
        if (as === 'special') return 'specialHoliday'
        return 'rest'
    }
    const rank = { regularHoliday: 3, specialHoliday: 2, rest: 1 }
    return (date) => {
        const list = lookup(toYMD(date))
        if (list && list.length > 0) {
            return list.map(kindOfHoliday).sort((a, b) => rank[b] - rank[a])[0]
        }
        const dow = date.getDay()
        return dow === 0 || dow === 6 ? 'rest' : 'work'
    }
}

/** The "is this a working day?" test: Monday–Friday and not a holiday. */
export function makeIsWorkday(holidayYMDs = null) {
    const kind = makeDayKind(holidayYMDs)
    return (date) => kind(date) === 'work'
}

const defaultIsWorkday = makeIsWorkday()

/** Is this clock time in the night-differential window (10:00 PM – 6:00 AM)? */
export function inND(date) {
    const m = date.getHours() * 60 + date.getMinutes()
    return m >= ND_START_MIN || m < ND_END_MIN
}

/** Minutes of [inAt, outAt] that fall inside regular hours, summed over every working day it touches. */
export function workOverlapMinutes(inAt, outAt, isWorkday = defaultIsWorkday) {
    if (!(outAt > inAt)) return 0
    let total = 0
    const day = new Date(inAt.getFullYear(), inAt.getMonth(), inAt.getDate())
    const last = new Date(outAt.getFullYear(), outAt.getMonth(), outAt.getDate())
    for (; day <= last; day.setDate(day.getDate() + 1)) {
        if (!isWorkday(day)) continue
        const from = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, WORK_START_MIN)
        const to = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, WORK_END_MIN)
        const ms = Math.min(outAt, to) - Math.max(inAt, from)
        if (ms > 0) total += ms
    }
    return Math.round(total / 60000)
}

/**
 * The minutes that ACTUALLY count in one stretch of work, as a sorted list of
 * minute-start times (ms). Three things shape it:
 *   1. Regular hours are not overtime: on a working day the minutes inside
 *      9:00 AM – 6:00 PM are left out (isWorkday decides which days those are).
 *   2. Break: if what remains is longer than 5 hours, 1 hour comes off.
 *   3. The break is taken from the earliest minutes OUTSIDE the ND window first,
 *      so the ND hours stay whole; it only eats ND minutes if there are not
 *      enough others.
 * Returns { minutes: number[], breakTaken: number } (breakTaken in minutes).
 */
export function actualMinutes(inAt, outAt, isWorkday = () => false) {
    const out = []
    const startMs = Math.ceil(inAt.getTime() / 60000) * 60000
    for (let t = startMs; t < outAt.getTime(); t += 60000) {
        const d = new Date(t)
        if (isWorkday(d)) {
            const m = d.getHours() * 60 + d.getMinutes()
            if (m >= WORK_START_MIN && m < WORK_END_MIN) continue
        }
        out.push(t)
    }
    if (out.length <= BREAK_AFTER_MIN) return { minutes: out, breakTaken: 0 }

    let toDrop = BREAK_MIN
    const kept = []
    for (const t of out) { // pass 1: earliest non-ND minutes
        if (toDrop > 0 && !inND(new Date(t))) { toDrop--; continue }
        kept.push(t)
    }
    if (toDrop > 0) { // not enough non-ND minutes: the rest comes off the earliest ND minutes
        kept.splice(0, toDrop)
    }
    return { minutes: kept, breakTaken: BREAK_MIN }
}

const clock12 = (min) => {
    const h = Math.floor(min / 60) % 24
    const m = min % 60
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

const toMin = (hhmm) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '')
    return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/**
 * Everything wrong with ONE overtime session as it is about to be saved. Used to
 * stop the save, so each message is written to be shown to the person.
 *   date     the day the session is on (a Date)
 *   inTime   'HH:MM' (24h) or '' / null
 *   outTime  'HH:MM' (24h) or '' / null
 *   reason   the reason typed for THIS session
 * Returns [{ kind: 'reason' | 'work-time', message }] — empty when it is fine.
 * A session with no times at all has nothing to check.
 */
export function checkOTSession({ date, inTime, outTime, reason }, isWorkday = defaultIsWorkday) {
    const a = toMin(inTime)
    const b = toMin(outTime)
    if (a === null && b === null) return []
    const problems = []

    if (!String(reason || '').trim()) {
        problems.push({ kind: 'reason', message: 'Add a reason for this overtime.' })
    }

    if (isWorkday(date)) {
        const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
        const at = (min) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, min)
        let inside = false
        if (a !== null && b !== null) {
            let end = at(b)
            if (end <= at(a)) end = new Date(end.getTime() + 24 * 3600 * 1000) // runs past midnight
            inside = workOverlapMinutes(at(a), end, isWorkday) > 0
        } else if (a !== null) {
            inside = a >= WORK_START_MIN && a < WORK_END_MIN
        } else {
            inside = b > WORK_START_MIN && b < WORK_END_MIN
        }
        if (inside) {
            const range = a !== null && b !== null ? `${clock12(a)} – ${clock12(b)}` : clock12(a ?? b)
            problems.push({
                kind: 'work-time',
                message: `${range} is inside regular hours (${WORK_HOURS_TEXT}). Overtime has to be before 9:00 AM or after 6:00 PM.`,
            })
        }
    }
    return problems
}
