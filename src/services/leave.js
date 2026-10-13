// Leave / offset rules that need no Firebase — kept pure so they can be tested
// in plain node (tests/leave.test.mjs) and shared by the forms, the approval
// queue and the DTR table so they can never disagree about what a request costs.

export const LEAVE_TYPES = {
    sick: { label: 'Sick Leave', short: 'SL', unit: 'day', color: 'var(--accent-red)' },
    vacation: { label: 'Vacation Leave', short: 'VL', unit: 'day', color: 'var(--accent-blue)' },
    offset: { label: 'Offset Hours', short: 'OFFSET', unit: 'hour', color: 'var(--accent-purple)' },
}
export const LEAVE_TYPE_KEYS = Object.keys(LEAVE_TYPES)

// What someone starts with until HR sets their balance. This is a stand-in, not
// policy: it only applies to people with no leaveBalances doc, and an admin
// overwrites it the first time they adjust that person.
export const DEFAULT_ALLOTMENT = { sick: 5, vacation: 5, offset: 0 }

export const HOURS_PER_DAY = 8

// Who sees the Leave & Offset tab. Admins and super admins only while it is
// being rolled out. To open it to everyone, make this return true. This hides
// the screen; it is not a security boundary — firestore.rules still decides
// who can read and write requests.
export const canUseLeave = (user) => ['admin', 'super_admin'].includes(user?.role)

export const STATUS = { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected' }

const pad = (n) => String(n).padStart(2, '0')

/** Local `YYYY-MM-DD`. Never toISOString — that is UTC and lands on the wrong day east of it. */
export const toYMD = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** `YYYY-MM-DD` -> a LOCAL midnight Date. `new Date('2026-09-10')` is UTC and is the off-by-one to avoid. */
export function parseYMD(str) {
    if (typeof str !== 'string') return null
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str)
    if (!m) return null
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    // Rejects 2026-02-31, which Date would silently roll into March.
    return toYMD(d) === str ? d : null
}

export const isWeekday = (date) => {
    const day = date.getDay()
    return day !== 0 && day !== 6
}

/** Every Mon–Fri `YYYY-MM-DD` from start to end inclusive. Holidays are not modelled. */
export function workdaysBetween(startYMD, endYMD) {
    const start = parseYMD(startYMD)
    const end = parseYMD(endYMD)
    if (!start || !end || start > end) return []
    const days = []
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (isWeekday(d)) days.push(toYMD(d))
    }
    return days
}

export const countWorkdays = (startYMD, endYMD) => workdaysBetween(startYMD, endYMD).length

const round2 = (n) => Math.round(n * 100) / 100

/** Days for sick/vacation, hours for offset — the unit each balance is kept in. */
export const requestAmount = (req) => (req.type === 'offset' ? Number(req.hours) || 0 : Number(req.days) || 0)

export const formatAmount = (type, amount) => {
    const n = round2(amount)
    const unit = LEAVE_TYPES[type]?.unit === 'hour' ? 'hr' : 'day'
    return `${n} ${unit}${n === 1 ? '' : 's'}`
}

/**
 * Allotted / used / pending / remaining per type.
 *
 * `used` is DERIVED from approved requests instead of being a counter stored on
 * the balance doc: a counter is a second copy that drifts the first time one
 * write succeeds and the other doesn't, and a revoked approval would have to
 * remember to decrement it. `allotted` is the only thing HR edits.
 */
export function summarize(allotted, requests = []) {
    const out = {}
    for (const type of LEAVE_TYPE_KEYS) {
        const total = Number(allotted?.[type])
        const alloc = Number.isFinite(total) ? total : DEFAULT_ALLOTMENT[type]
        let used = 0
        let pending = 0
        for (const r of requests) {
            if (r.type !== type) continue
            if (r.status === STATUS.APPROVED) used += requestAmount(r)
            else if (r.status === STATUS.PENDING) pending += requestAmount(r)
        }
        out[type] = {
            allotted: round2(alloc),
            used: round2(used),
            pending: round2(pending),
            remaining: round2(alloc - used),
            // What a NEW request can still draw on: pending ones are spoken for.
            available: round2(alloc - used - pending),
        }
    }
    return out
}

const isActive = (r) => r.status === STATUS.PENDING || r.status === STATUS.APPROVED

/** The pending/approved request that already covers any day in start..end, if one does. */
export function findOverlap(requests, startYMD, endYMD) {
    return requests.find(r => isActive(r) && r.startDate <= endYMD && r.endDate >= startYMD) || null
}

/**
 * The approved request that covers `date`, for the DTR. A day-based leave only
 * claims weekdays inside its range (a Fri–Mon sick leave is two days, and
 * Saturday is not "on leave"); an offset claims its one date.
 */
export function leaveForDate(requests, date) {
    if (!requests || requests.length === 0) return null
    const ymd = toYMD(date)
    return requests.find(r => {
        if (r.status !== STATUS.APPROVED) return false
        if (ymd < r.startDate || ymd > r.endDate) return false
        return r.type === 'offset' ? true : isWeekday(date)
    }) || null
}

/**
 * One validator for the form (live feedback) and the api (the write). Returns
 * `{ error }` or `{ amount, startDate, endDate }` with the normalised values.
 */
export function validateRequest({ type, startDate, endDate, hours }, summary, existing = []) {
    if (!LEAVE_TYPES[type]) return { error: 'Pick a request type.' }
    if (!parseYMD(startDate)) return { error: 'Pick a date.' }

    let end = endDate
    let amount
    if (type === 'offset') {
        end = startDate // offset is for one date; the hours say how much of it
        amount = Number(hours)
        if (!Number.isFinite(amount) || amount <= 0) return { error: 'Enter how many offset hours you are using.' }
        if (amount > HOURS_PER_DAY) return { error: `An offset request covers at most ${HOURS_PER_DAY} hours per day.` }
        if (Math.round(amount * 2) !== amount * 2) return { error: 'Offset hours go in half-hour steps.' }
        if (!isWeekday(parseYMD(startDate))) return { error: 'Offset hours can only be used on a weekday.' }
    } else {
        if (!parseYMD(end)) return { error: 'Pick an end date.' }
        if (end < startDate) return { error: 'The end date is before the start date.' }
        amount = countWorkdays(startDate, end)
        if (amount === 0) return { error: 'That range has no working days (weekends only).' }
    }

    const overlap = findOverlap(existing, startDate, end)
    if (overlap) {
        return { error: `This overlaps your ${overlap.status} ${LEAVE_TYPES[overlap.type].label} request (${overlap.startDate}${overlap.endDate !== overlap.startDate ? ` to ${overlap.endDate}` : ''}).` }
    }

    const bucket = summary?.[type]
    if (bucket && amount > bucket.available) {
        const left = Math.max(0, bucket.available)
        return {
            error: `Not enough ${LEAVE_TYPES[type].label.toLowerCase()} balance: you asked for ${formatAmount(type, amount)} and have ${formatAmount(type, left)} available`
                + (bucket.pending > 0 ? ` (${formatAmount(type, bucket.pending)} is tied up in pending requests).` : '.'),
        }
    }

    return { amount, startDate, endDate: end }
}

/** "Mon, 12 Oct 2026" from a YMD string, for lists. */
export function formatYMD(str) {
    const d = parseYMD(str)
    return d ? d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : str
}

export const formatRange = (req) => req.startDate === req.endDate
    ? formatYMD(req.startDate)
    : `${formatYMD(req.startDate)} – ${formatYMD(req.endDate)}`

/** The DTR notes line: "Sick Leave — Fever" / "Offset · 4 hrs — Offsetting Saturday OT". Reason is optional. */
export function leaveNote(req) {
    const head = req.type === 'offset' ? `Offset · ${dtrLabel(req).replace('OFFSET · ', '')}` : LEAVE_TYPES[req.type].label
    return req.reason ? `${head} — ${req.reason}` : head
}

/** Short DTR badge text: "SL", "VL", "OFFSET · 4 hrs". */
export function dtrLabel(req) {
    if (req.type === 'offset') return `OFFSET · ${round2(req.hours)} hr${Number(req.hours) === 1 ? '' : 's'}`
    return LEAVE_TYPES[req.type].short
}
