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

/**
 * A time as a person types it -> { h: '9', m: '30', p: 'AM' | 'PM' | '' }, or null
 * when it isn't a time. `p` is '' when AM/PM wasn't said and can't be worked out.
 *   "9"  "9:30"  "930"  "0930"  "9:30pm"  "9 pm"  "9p"  -> as typed
 *   "21:30"  "2130"  "13"  -> 24-hour times, so the PM is known
 *   "0:30" "00:30" -> 12:30 AM
 * Minutes must be two digits after a colon ("9:3" is not a time yet). A suffix
 * that contradicts a 24-hour hour ("21:30am") is not a time.
 */
export function parseTypedTime(input) {
    let t = String(input || '').trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, '')
    if (!t) return null
    let p = ''
    const suffix = /(a|p)m?$/.exec(t)
    if (suffix) { p = suffix[1] === 'a' ? 'AM' : 'PM'; t = t.slice(0, suffix.index) }

    let hh, mm, m
    if ((m = /^(\d{1,2}):(\d{2})$/.exec(t))) { hh = Number(m[1]); mm = Number(m[2]) }
    else if ((m = /^(\d{1,2})$/.exec(t))) { hh = Number(m[1]); mm = 0 }
    else if ((m = /^(\d{1,2})(\d{2})$/.exec(t))) { hh = Number(m[1]); mm = Number(m[2]) }
    else return null
    if (mm > 59 || hh > 23) return null

    if (hh > 12) { // 13–23: a 24-hour time, so it is PM
        if (p === 'AM') return null
        p = 'PM'; hh -= 12
    } else if (hh === 0) { // 0: 12 AM
        if (p === 'PM') return null
        p = 'AM'; hh = 12
    }
    return { h: String(hh), m: String(mm).padStart(2, '0'), p }
}

/** { h: '9', m: '05' } -> "9:05". */
export const formatClock = ({ h, m }) => `${h}:${m}`

/** "21:30" moved by `delta` minutes (wrapping round midnight) -> "21:45". '' stays ''. */
export function stepTime24(hhmm, delta) {
    const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '')
    if (!m) return ''
    const total = (((Number(m[1]) * 60 + Number(m[2]) + delta) % 1440) + 1440) % 1440
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
