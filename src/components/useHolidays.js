import { useEffect, useMemo, useState } from 'react'
import { holidayApi } from '../services/api'
import { holidaysForYears, holidaysByDate } from '../services/holidays'
import { makeDayKind, makeIsWorkday } from '../services/workday'

// What HR has stored is read once and shared: every DTR table on a page asks the
// same question. HR's own editor calls resetHolidayCache() after a change so the
// next table to mount sees it.
let storedPromise = null
const loadStored = () => (storedPromise ||= holidayApi.list().catch(() => { storedPromise = null; return null }))
export const resetHolidayCache = () => { storedPromise = null }

/**
 * Holidays for the DTR: `byDate` ({ 'YYYY-MM-DD': [holiday, ...] }, a multi-day
 * holiday is on every day it covers), `isWorkday(date)` (Monday–Friday that isn't
 * a holiday) and `dayKind(date)` ('work' | 'rest' | 'regularHoliday' |
 * 'specialHoliday', what the day counts as for pay), for the given years and the year either side — a holiday can
 * start at the end of one year and run into the next.
 *
 * Until the stored holidays arrive, or if they can't be read, the built-in
 * Philippine list is used on its own, so the table never waits on this and never
 * breaks because of it.
 */
export function useHolidays(years) {
    const [stored, setStored] = useState(null)

    useEffect(() => {
        let off = false
        loadStored().then(list => { if (!off) setStored(list || []) })
        return () => { off = true }
    }, [])

    const key = [...new Set(years)].filter(Number.isFinite).sort().join(',')
    const byDate = useMemo(() => {
        const ys = new Set()
        for (const y of key ? key.split(',').map(Number) : [new Date().getFullYear()]) { ys.add(y - 1); ys.add(y); ys.add(y + 1) }
        return holidaysByDate(holidaysForYears([...ys], stored || []))
    }, [key, stored])
    const isWorkday = useMemo(() => makeIsWorkday(byDate), [byDate])
    const dayKind = useMemo(() => makeDayKind(byDate), [byDate])

    return { byDate, isWorkday, dayKind }
}
