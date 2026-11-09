// Philippine + company holidays. Pure, so it runs in plain node
// (tests/calendar.test.mjs) and the calendar, attendance and DTR can all ask the
// same question: "is this date a holiday?"
//
// WHERE THE LIST COMES FROM
//   1. phHolidays(year) — the holidays that are fixed by law or fall out of a
//      rule (Easter, "last Monday of August"). Generated, so it never goes stale
//      and nobody has to remember to add next year.
//   2. EXTRA_PH — the ones that do NOT follow a rule and are set by proclamation
//      each year (Chinese New Year, Eid). Only years we are sure of are listed.
//   3. Firestore `holidays/*` — what HR adds, edits and hides. This is the part
//      that matters in practice: a late proclamation is a two-minute edit, not a
//      code push. See mergeHolidays().
//
// This is a STARTING list. The government decides each year's holidays by
// proclamation (and moves some), so HR should check it against the official
// one — the portal lets them correct any entry.

import { parseYMD, toYMD } from './leave.js'

export const HOLIDAY_TYPES = {
    regular: { label: 'Regular Holiday', short: 'Regular', color: 'var(--accent-red)' },
    special: { label: 'Special Non-Working Day', short: 'Special', color: 'var(--accent-amber)' },
    company: { label: 'Company Holiday', short: 'Company', color: 'var(--accent-purple)' },
}

const pad = (n) => String(n).padStart(2, '0')
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`

/** Easter Sunday (Gregorian), the anonymous Meeus/Jones/Butcher algorithm. */
export function easterSunday(year) {
    const a = year % 19
    const b = Math.floor(year / 100)
    const c = year % 100
    const d = Math.floor(b / 4)
    const e = b % 4
    const f = Math.floor((b + 8) / 25)
    const g = Math.floor((b - f + 1) / 3)
    const h = (19 * a + b - d - g + 15) % 30
    const i = Math.floor(c / 4)
    const k = c % 4
    const l = (32 + 2 * e + 2 * i - h - k) % 7
    const m = Math.floor((a + 11 * h + 22 * l) / 451)
    const month = Math.floor((h + l - 7 * m + 114) / 31)
    const day = ((h + l - 7 * m + 114) % 31) + 1
    return new Date(year, month - 1, day)
}

const shift = (date, days) => {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    return d
}

/** Last Monday of a month (National Heroes Day is the last Monday of August). */
function lastMonday(year, month) {
    const d = new Date(year, month, 0) // last day of `month` (1-based)
    while (d.getDay() !== 1) d.setDate(d.getDate() - 1)
    return d
}

// Holidays that follow no rule — proclaimed year by year. Listed only where the
// date is certain. Eid'l Fitr and Eid'l Adha are deliberately NOT here: they
// depend on the moon sighting and are proclaimed days before, so HR adds them.
const EXTRA_PH = {
    2026: [
        { date: '2026-02-17', name: 'Chinese New Year', type: 'special' },
    ],
    2027: [
        { date: '2027-02-06', name: 'Chinese New Year', type: 'special' },
    ],
}

/** The built-in Philippine holidays for one year: [{ id, date, name, type, source:'ph' }]. */
export function phHolidays(year) {
    const easter = easterSunday(year)
    const list = [
        { date: ymd(year, 1, 1), name: "New Year's Day", type: 'regular' },
        { date: toYMD(shift(easter, -3)), name: 'Maundy Thursday', type: 'regular' },
        { date: toYMD(shift(easter, -2)), name: 'Good Friday', type: 'regular' },
        { date: toYMD(shift(easter, -1)), name: 'Black Saturday', type: 'special' },
        { date: ymd(year, 4, 9), name: 'Araw ng Kagitingan', type: 'regular' },
        { date: ymd(year, 5, 1), name: 'Labor Day', type: 'regular' },
        { date: ymd(year, 6, 12), name: 'Independence Day', type: 'regular' },
        { date: ymd(year, 8, 21), name: 'Ninoy Aquino Day', type: 'special' },
        { date: toYMD(lastMonday(year, 8)), name: 'National Heroes Day', type: 'regular' },
        { date: ymd(year, 11, 1), name: "All Saints' Day", type: 'special' },
        { date: ymd(year, 11, 30), name: 'Bonifacio Day', type: 'regular' },
        { date: ymd(year, 12, 8), name: 'Feast of the Immaculate Conception', type: 'special' },
        { date: ymd(year, 12, 24), name: 'Christmas Eve', type: 'special' },
        { date: ymd(year, 12, 25), name: 'Christmas Day', type: 'regular' },
        { date: ymd(year, 12, 30), name: 'Rizal Day', type: 'regular' },
        { date: ymd(year, 12, 31), name: 'Last Day of the Year', type: 'special' },
        ...(EXTRA_PH[year] || []),
    ]
    return list
        .map(h => ({ ...h, id: `ph-${h.date}`, source: 'ph' }))
        .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Built-in list + what HR has stored in Firestore.
 *
 * A stored doc whose id starts `ph-` is an OVERRIDE of the built-in holiday with
 * that id: it replaces the name/type/date, or — with `hidden: true` — removes it
 * (HR deleting a holiday that was not proclaimed this year). Anything else is a
 * company holiday HR added. Hiding is a flag rather than a delete so the built-in
 * list cannot grow it back the next time the page loads.
 */
export function mergeHolidays(builtIn, stored = []) {
    const byId = new Map(builtIn.map(h => [h.id, h]))
    for (const doc of stored) {
        if (!doc || !doc.id) continue
        if (doc.hidden === true) { byId.delete(doc.id); continue }
        if (!parseYMD(doc.date) || !HOLIDAY_TYPES[doc.type]) continue // ignore a malformed doc rather than crash the calendar
        const isOverride = doc.id.startsWith('ph-')
        byId.set(doc.id, {
            id: doc.id, date: doc.date, name: doc.name || 'Holiday', type: doc.type,
            source: isOverride ? 'ph-edited' : 'company',
        })
    }
    return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
}

/** Every built-in holiday across the years a view spans, merged with HR's edits. */
export function holidaysForYears(years, stored = []) {
    const builtIn = [...new Set(years)].flatMap(phHolidays)
    return mergeHolidays(builtIn, stored)
}

/** { 'YYYY-MM-DD': [holiday, ...] } — two holidays can share a date. */
export function holidaysByDate(list) {
    const map = {}
    for (const h of list) (map[h.date] ||= []).push(h)
    return map
}
