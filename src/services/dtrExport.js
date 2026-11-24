// What goes on each line of the exported DTR sheet. Pure (tests/dtrExport.test.mjs);
// dtrWorkbook.js turns these rows into the actual .xlsx.
//
// The sheet has one line per day: DAY, DATE, REGULAR TIME (in/out), OVERTIME
// (in/out) and REASON FOR OT. A day with several OT sessions gets one extra line
// per extra session (no day or date on it), so every OT row has its own times and
// its own reason and every time stays a real time Excel can calculate with.

import { toYMD, parseYMD, leaveForDate, dtrLabel, isPartialDay, LEAVE_TYPES } from './leave.js'

const asDate = (ts) => (ts instanceof Date ? ts : new Date(ts))

/** What a leave/offset day says in the Time In cell when nothing was clocked. */
const leaveText = (leave) => (leave.type === 'offset' || isPartialDay(leave) ? dtrLabel(leave) : LEAVE_TYPES[leave.type].label)

/**
 * Rows for the sheet.
 *   dates            the days of the period, in order (Dates)
 *   logs             the person's logs (any dates — only the days listed are read)
 *   leaves           their leave/offset requests (only approved ones are drawn)
 *   holidaysByDate   { 'YYYY-MM-DD': [holiday, …] }
 * Each row: { day, date, regIn, regOut, otIn, otOut, reason }
 *   day/date are '' / null on the extra line of a split-OT day
 *   regIn/regOut/otIn/otOut are a Date (a time to format), a string (text to show
 *   as it is — "Sick Leave", a holiday's name), or null (empty)
 */
export function exportRows({ dates, logs = [], leaves = [], holidaysByDate = {} }) {
    const byDay = new Map()
    for (const log of logs) {
        if (log.type === 'EDIT' || log.type === 'NOTE') continue
        const ts = asDate(log.timestamp)
        if (Number.isNaN(ts.getTime())) continue
        const k = toYMD(ts)
        if (!byDay.has(k)) byDay.set(k, [])
        byDay.get(k).push({ ...log, ts })
    }

    const rows = []
    for (const date of dates) {
        const ymd = toYMD(date)
        const dayLogs = byDay.get(ymd) || []
        const first = (type) => dayLogs.filter(l => l.type === type).sort((a, b) => a.ts - b.ts)[0]?.ts || null
        const last = (type) => dayLogs.filter(l => l.type === type).sort((a, b) => b.ts - a.ts)[0]?.ts || null

        let regIn = first('IN')
        const regOut = last('OUT')
        // Nothing clocked on a day off: say what kind of day it was, in the first cell.
        if (!regIn && !regOut) {
            const leave = leaveForDate(leaves, date)
            const holiday = holidaysByDate[ymd]?.[0]
            if (leave) regIn = leaveText(leave)
            else if (holiday) regIn = holiday.name
        }

        const sessions = new Map()
        for (const l of dayLogs) {
            if (l.type !== 'OT_IN' && l.type !== 'OT_OUT') continue
            const s = l.session || 0
            const g = sessions.get(s) || { otIn: null, otOut: null, reason: '' }
            if (l.type === 'OT_IN') g.otIn = l.ts
            else g.otOut = l.ts
            if (String(l.otReason || '').trim()) g.reason = String(l.otReason).trim()
            sessions.set(s, g)
        }
        const ordered = [...sessions.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g)

        const day = date.toLocaleDateString('en-US', { weekday: 'long' })
        if (ordered.length === 0) {
            rows.push({ day, date, regIn, regOut, otIn: null, otOut: null, reason: '' })
        } else {
            ordered.forEach((g, i) => {
                rows.push(i === 0
                    ? { day, date, regIn, regOut, otIn: g.otIn, otOut: g.otOut, reason: g.reason }
                    : { day: '', date: null, regIn: null, regOut: null, otIn: g.otIn, otOut: g.otOut, reason: g.reason })
            })
        }
    }
    return rows
}

/** '2025-03-17' -> "March 17, 2025"; '' (or nothing usable) -> ''. */
export function longDate(ymd) {
    const d = parseYMD(ymd || '')
    return d ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''
}

/** "November 1, 2026 – November 15, 2026" */
export function cutoffText(start, end) {
    const f = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    return `${f(start)} – ${f(end)}`
}
