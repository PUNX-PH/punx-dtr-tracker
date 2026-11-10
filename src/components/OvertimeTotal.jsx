import { useMemo } from 'react'
import { Timer } from 'lucide-react'
import { cutoffWindow, formatDuration, otHoursFromLogs } from '../services/overtime'
import { formatYMD } from '../services/leave'

/**
 * Total overtime for the period the DTR below is showing, as hours and minutes.
 * It is the same counting the OT → offset conversion uses (services/overtime.js):
 * complete OT in/out pairs only, summed to the minute.
 *
 * `cutoff` is the period on screen; with none selected the whole loaded history
 * is totalled and the card says so, rather than implying it is one cutoff.
 */
export default function OvertimeTotal({ history, cutoff }) {
    const { total, label } = useMemo(() => {
        if (!cutoff) return { total: otHoursFromLogs(history), label: 'All recorded overtime' }
        const win = cutoffWindow(cutoff)
        const inWindow = history.filter(l => {
            const t = new Date(l.timestamp)
            return t >= win.from && t <= win.to
        })
        const short = (ymd) => formatYMD(ymd).replace(/ \d{4}$/, '')
        return { total: otHoursFromLogs(inWindow), label: `${short(win.startYMD)} – ${short(win.endYMD)}` }
    }, [history, cutoff])

    return (
        <section className="bg-[var(--surface-1)] rounded-3xl border border-[var(--border)] px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-2">
            <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[var(--accent-purple)]/10 rounded-xl text-[var(--accent-purple)]"><Timer size={18} /></div>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Total overtime</p>
                    <p className="text-2xl font-bold text-[var(--text-primary)] tabular-nums" aria-label={`Total overtime ${formatDuration(total.minutes)}`}>
                        {formatDuration(total.minutes)}
                    </p>
                </div>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
                {label} · {total.sessions} {total.sessions === 1 ? 'session' : 'sessions'}
                {total.hours > 0 && <> · {total.hours} hrs</>}
            </p>
            {total.skipped > 0 && (
                <p className="text-xs text-[var(--accent-amber)]">
                    {total.skipped} OT {total.skipped === 1 ? 'entry has' : 'entries have'} a start without a valid end, so {total.skipped === 1 ? 'it isn’t' : 'they aren’t'} counted.
                </p>
            )}
        </section>
    )
}
