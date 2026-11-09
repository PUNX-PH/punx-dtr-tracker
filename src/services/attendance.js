// Attendance monitoring: what happened on each working day, per person. Pure,
// so the rule for "late" lives in one place and is tested
// (tests/calendar.test.mjs) instead of being re-derived inside a component.
//
// There is deliberately no "absent": a weekday with no time entry is shown as
// "No entry" and nothing more. Whether that means anything is a conversation, not
// something this screen should decide.
//
// A day is classified from the person's logs, their approved leave, the holidays
// and today's date — never from anything the person can type into a status field.
//
//   WORK_START   9:00 AM, the same shift Smart Fill uses (9am–6pm). Arriving after
//                it is "late". There is no grace period yet.
//   Present      any real time entry that day: IN, OUT, OT_IN or OT_OUT.
//                (EDIT / REASON / NOTE rows are bookkeeping, not attendance.)

import { parseYMD, toYMD, isWeekday, leaveForDate } from './leave.js'

export const WORK_START_MINUTES = 9 * 60

const WORK_LOG_TYPES = new Set(['IN', 'OUT', 'OT_IN', 'OT_OUT'])

export const DAY_STATUS = {
    present: { label: 'Present', short: 'P', color: 'var(--accent-green)' },
    late: { label: 'Late', short: 'L', color: 'var(--accent-amber)' },
    leave: { label: 'On leave', short: 'LV', color: 'var(--accent-blue)' },
    offset: { label: 'Offset', short: 'OS', color: 'var(--accent-purple)' },
    holiday: { label: 'Holiday', short: 'H', color: 'var(--accent-teal)' }, // not purple: that is Offset
    weekend: { label: 'Weekend', short: '', color: 'var(--text-muted)' },
    noentry: { label: 'No entry', short: '', color: 'var(--text-muted)' },
    upcoming: { label: 'Not yet', short: '', color: 'var(--text-muted)' },
}

const asDate = (v) => (v instanceof Date ? v : new Date(v))

/**
 * { 'YYYY-MM-DD': { firstIn: Date|null, worked: true } } from raw logs. Local
 * time throughout — a 9 AM Manila clock-in must land on that calendar day.
 */
export function workedDays(logs = []) {
    const days = {}
    for (const log of logs) {
        if (!WORK_LOG_TYPES.has(log.type)) continue
        const ts = asDate(log.timestamp)
        if (Number.isNaN(ts.getTime())) continue
        const key = toYMD(ts)
        const day = (days[key] ||= { firstIn: null, worked: true })
        if (log.type === 'IN' && (!day.firstIn || ts < day.firstIn)) day.firstIn = ts
    }
    return days
}

const minutesOfDay = (d) => d.getHours() * 60 + d.getMinutes()

export function isLate(firstIn) {
    return !!firstIn && minutesOfDay(firstIn) > WORK_START_MINUTES
}

/**
 * One day's status.
 *   ymd        'YYYY-MM-DD'
 *   worked     workedDays()[ymd] or undefined
 *   leave      the approved request covering the day, if any (leaveForDate)
 *   holiday    a holiday on the day, if any
 *   today      'YYYY-MM-DD' — today and later are 'upcoming', never 'noentry'
 */
export function dayStatus({ ymd, worked, leave, holiday, today }) {
    const date = parseYMD(ymd)
    if (!date) return 'noentry'
    if (worked) return isLate(worked.firstIn) && isWeekday(date) && !holiday ? 'late' : 'present'
    if (!isWeekday(date)) return 'weekend'
    if (holiday) return 'holiday'
    if (leave) return leave.type === 'offset' ? 'offset' : 'leave'
    if (ymd >= today) return 'upcoming'
    return 'noentry'
}

/** Every date in [startYMD, endYMD] as a status list: [{ ymd, status, leave?, holiday? }]. */
export function classifyRange({ startYMD, endYMD, logs, leaves, holidaysByDate = {}, today }) {
    const worked = workedDays(logs)
    const out = []
    const start = parseYMD(startYMD)
    const end = parseYMD(endYMD)
    if (!start || !end) return out
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const ymd = toYMD(d)
        const leave = leaveForDate(leaves, d)
        const holiday = holidaysByDate[ymd]?.[0] || null
        out.push({
            ymd,
            leave,
            holiday,
            status: dayStatus({ ymd, worked: worked[ymd], leave, holiday, today }),
        })
    }
    return out
}

/** Counts per status. "Attended" counts a late arrival too — they were there. */
export function summarizeDays(days) {
    const totals = { present: 0, late: 0, leave: 0, offset: 0, holiday: 0, noentry: 0 }
    for (const d of days) if (d.status in totals) totals[d.status]++
    return { ...totals, attended: totals.present + totals.late }
}
