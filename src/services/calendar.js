// The Department Calendar's maths — which days a month grid shows and what lands
// on each one. Pure; the component only draws what this returns.

import { parseYMD, toYMD, isWeekday, LEAVE_TYPES } from './leave.js'

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const monthKey = (year, month) => `${year}-${String(month + 1).padStart(2, '0')}`

/** First and last day of a month as YMD. `month` is 0-based, like Date. */
export function monthBounds(year, month) {
    return { start: toYMD(new Date(year, month, 1)), end: toYMD(new Date(year, month + 1, 0)) }
}

/** Step a { year, month } by n months, rolling the year. */
export function addMonths({ year, month }, n) {
    const d = new Date(year, month + n, 1)
    return { year: d.getFullYear(), month: d.getMonth() }
}

/**
 * The cells of a month grid, Sunday-first, padded with the neighbouring months'
 * days so every row is a full week: [{ ymd, day, inMonth }]. Always 5 or 6 rows.
 */
export function monthGrid(year, month) {
    const first = new Date(year, month, 1)
    const cursor = new Date(year, month, 1 - first.getDay())
    const cells = []
    const lastOfMonth = new Date(year, month + 1, 0)
    while (cells.length % 7 !== 0 || cursor <= lastOfMonth) {
        cells.push({ ymd: toYMD(cursor), day: cursor.getDate(), inMonth: cursor.getMonth() === month })
        cursor.setDate(cursor.getDate() + 1)
    }
    return cells
}

/**
 * A leave covers a day when the day is inside its range and — for day-based
 * leave — a weekday, so a Fri–Mon sick leave does not paint the weekend. An
 * offset claims its one date. Same rule as leaveForDate, but for MANY people.
 */
export function leavesOnDate(events, ymd) {
    const date = parseYMD(ymd)
    if (!date) return []
    return events.filter(e => {
        if (ymd < e.startDate || ymd > e.endDate) return false
        return e.type === 'offset' ? true : isWeekday(date)
    })
}

/** Everything on one day: the holidays and who is on leave. */
export function eventsForDate(ymd, { holidaysByDate = {}, leaves = [] }) {
    return {
        holidays: holidaysByDate[ymd] || [],
        leaves: leavesOnDate(leaves, ymd),
    }
}

/** Narrow events/people to one department; '' / null means everyone. */
export const inDepartment = (departmentId) => (item) => !departmentId || item.departmentId === departmentId

/** "SL", "VL", "OFFSET" — the short tag drawn next to a name on a day. */
export const leaveTag = (type) => LEAVE_TYPES[type]?.short || type

/**
 * The calendar event a leave request becomes once approved (calendarEvents/{id}).
 * It carries NO reason on purpose: the whole company can read these, and a sick
 * leave reason is not for the whole company.
 */
export function calendarEventFrom(req) {
    return {
        userId: req.userId,
        userName: req.userName || '',
        departmentId: req.departmentId || '',
        type: req.type,
        startDate: req.startDate,
        endDate: req.endDate,
        hours: req.type === 'offset' ? Number(req.hours) || 0 : 0,
    }
}
