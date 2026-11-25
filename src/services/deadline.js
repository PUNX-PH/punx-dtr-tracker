// The DTR submission deadline, and what to say about it. Pure (tests/deadline.test.mjs).
//
// Each cutoff stores its own deadline (`submitBy`); when it doesn't, the deadline is
// 10:00 AM the day after the period ends — which is the 11th and the 26th for the
// usual 26th–10th and 11th–25th periods. Using the stored one means a holiday that
// moves the deadline moves the reminders with it.

import { toYMD } from './leave.js'
import { formatDuration } from './overtime.js'

export const DEFAULT_DEADLINE_HOUR = 10

const asDate = (v) => (v && typeof v.toDate === 'function' ? v.toDate() : v instanceof Date ? v : null)

/** When the DTR for this cutoff is due: its stored deadline, else 10:00 AM the day after it ends. null if unknowable. */
export function deadlineFor(cutoff) {
    if (!cutoff) return null
    const stored = asDate(cutoff.submitBy)
    if (stored && !Number.isNaN(stored.getTime())) return stored
    const end = asDate(cutoff.endDate)
    if (!end || Number.isNaN(end.getTime())) return null
    return new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1, DEFAULT_DEADLINE_HOUR, 0)
}

/**
 * Where one person stands against the deadline.
 *   done       they have submitted (a rejected DTR still has to be redone, so it isn't done)
 *   due-today  it is the deadline day and the deadline hasn't come — the "11th / 26th until 10 AM" reminder
 *   overdue    the deadline has passed and they haven't submitted
 *   before     earlier than the deadline day
 *   none       no cutoff to speak of
 * Returns { phase, deadline, msLeft?, msLate? }.
 */
export function deadlineState({ cutoff, submission, now = new Date() }) {
    const deadline = deadlineFor(cutoff)
    if (!deadline) return { phase: 'none', deadline: null }
    if (submission && submission.status !== 'rejected') return { phase: 'done', deadline }
    if (now > deadline) return { phase: 'overdue', deadline, msLate: now - deadline }
    if (toYMD(now) === toYMD(deadline)) return { phase: 'due-today', deadline, msLeft: deadline - now }
    return { phase: 'before', deadline, msLeft: deadline - now }
}

/** "10:00 AM" */
export const clockText = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

/** "Thu, Nov 26 at 10:00 AM" */
export const deadlineText = (d) => `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${clockText(d)}`

/** "3 hrs 20 mins" until / since, to the minute. */
export const spanText = (ms) => formatDuration(Math.max(0, Math.round(ms / 60000)))

/**
 * Who still owes a DTR: everyone current with NO submission for the cutoff. (Someone
 * whose DTR was rejected already has a notice telling them to redo it.)
 * `submissions` is { [userId]: submission } or an array of submissions.
 */
export function overdueRecipients(users, submissions) {
    const sent = new Set(Array.isArray(submissions) ? submissions.map(s => s.userId) : Object.keys(submissions || {}))
    return users.filter(u => !u.removed && !sent.has(u.id))
}

/** "Nov 11 – Nov 25" for a cutoff. */
export function periodText(cutoff) {
    const f = (v) => asDate(v)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) || '?'
    return `${f(cutoff?.startDate)} – ${f(cutoff?.endDate)}`
}
