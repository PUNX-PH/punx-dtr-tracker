// Overtime → offset. Pure, so the rule is one tested function instead of
// arithmetic scattered through screens (tests/overtime.test.mjs).
//
// THE RULE (what the Info dialog on Leave & Offset tells people — it reads the
// constants below, so the text and the maths cannot disagree):
//   • OT is counted per CUTOFF, from the OT_IN / OT_OUT pairs on the DTR. The
//     counter starts again at zero with every new cutoff.
//   • The first OT_THRESHOLD_HOURS (20) of a cutoff stay ordinary overtime.
//   • Every hour past that becomes offset, 1 hour of OT = 1 hour of offset.
//   • It is credited when the cutoff's DTR is APPROVED, as a snapshot stored on
//     the submission — not recalculated later, because people can edit their own
//     logs after approval.
//   • There is no cap on offset. Super admins get a warning once someone's
//     remaining offset passes OFFSET_WARN_HOURS (30); the excess still counts.

import { parseYMD, toYMD } from './leave.js'

export const OT_THRESHOLD_HOURS = 20
export const OFFSET_WARN_HOURS = 30

const round2 = (n) => Math.round(n * 100) / 100

/**
 * OT sessions from raw logs. A session is an OT_IN and an OT_OUT with the same
 * local calendar day and session number (a day can have several — "split OT").
 * Returns { hours, minutes, sessions, skipped, incomplete, byDay }:
 *   hours     total of the complete, sensible sessions (2 decimals)
 *   minutes   the same total in whole minutes — what "X hrs Y mins" is built from
 *   sessions  how many were counted
 *   skipped   sessions with an IN but no OUT (or the reverse), or an OUT that is
 *             not after the IN. They count for nothing rather than guessing — an
 *             overnight session typed as 6 PM → 2 AM on one row would otherwise
 *             be a negative number, or a made-up 8 hours.
 *   incomplete  WHICH sessions were skipped, so a reviewer can go and look:
 *               [{ day:'YYYY-MM-DD', session, problem, inAt, outAt }] where problem
 *               is 'no-end', 'no-start' or 'bad-order' (end not after start)
 *   byDay       { 'YYYY-MM-DD': minutes } — each day's counted overtime
 */
export function otHoursFromLogs(logs = []) {
    const groups = new Map()
    for (const log of logs) {
        if (log.type !== 'OT_IN' && log.type !== 'OT_OUT') continue
        const ts = log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp)
        if (Number.isNaN(ts.getTime())) continue
        const key = `${toYMD(ts)}_${log.session || 0}`
        const g = groups.get(key) || { ins: [], outs: [] }
        ;(log.type === 'OT_IN' ? g.ins : g.outs).push(ts)
        groups.set(key, g)
    }
    let minutes = 0
    let sessions = 0
    const incomplete = []
    const byDay = {}
    for (const [key, g] of groups) {
        const [day, session] = key.split('_')
        const inAt = g.ins.length ? new Date(Math.min(...g.ins)) : null
        const outAt = g.outs.length ? new Date(Math.max(...g.outs)) : null
        const problem = !inAt ? 'no-start' : !outAt ? 'no-end' : outAt <= inAt ? 'bad-order' : null
        if (problem) { incomplete.push({ day, session: Number(session), problem, inAt, outAt }); continue }
        const m = Math.round((outAt - inAt) / 60000)
        minutes += m
        byDay[day] = (byDay[day] || 0) + m
        sessions++
    }
    incomplete.sort((a, b) => a.day.localeCompare(b.day) || a.session - b.session)
    return { hours: round2(minutes / 60), minutes, sessions, skipped: incomplete.length, incomplete, byDay }
}

/**
 * Overtime for the period a DTR is showing: only logs inside the cutoff's days
 * when there is one, else everything given. Adds `window` (or null).
 */
export function otForPeriod(logs = [], cutoff = null) {
    if (!cutoff) return { ...otHoursFromLogs(logs), window: null }
    const win = cutoffWindow(cutoff)
    const inside = logs.filter(l => {
        const t = new Date(l.timestamp)
        return t >= win.from && t <= win.to
    })
    return { ...otHoursFromLogs(inside), window: win }
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
