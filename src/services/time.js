// "HH:MM" (24h) <-> the hour / minute / AM-PM parts the DTR time dropdowns use.
// Pure so it can be tested in plain node (tests/time.test.mjs).

/** "21:05" -> { h: '9', m: '05', p: 'PM' }. Anything unparseable -> all blank. */
export function parseTime(value) {
    const m = /^(\d{2}):(\d{2})/.exec(value || '')
    if (!m) return { h: '', m: '', p: '' }
    const hours = Number(m[1])
    const minutes = Number(m[2])
    if (hours > 23 || minutes > 59) return { h: '', m: '', p: '' }
    return { h: String(hours % 12 || 12), m: m[2], p: hours >= 12 ? 'PM' : 'AM' }
}

/** { h: '9', m: '05', p: 'PM' } -> "21:05". 12 AM is 00:xx and 12 PM is 12:xx. */
export function toTime24({ h, m, p }) {
    const hours = (Number(h) % 12) + (p === 'PM' ? 12 : 0)
    return `${String(hours).padStart(2, '0')}:${m}`
}

export const isComplete = ({ h, m, p }) => !!(h && m && p)
export const isEmpty = ({ h, m, p }) => !h && !m && !p

/**
 * A Date as "HH:MM" from its own hours and minutes. Not toLocaleTimeString with
 * hour12:false, which prints midnight as "24:05" in some engines — an invalid
 * value for a time field, which showed late-night entries as blank.
 */
export function formatHHMM(date) {
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}
