import { useEffect, useState } from 'react'
import { Loader2, Timer } from 'lucide-react'
import { overtimeApi } from '../../services/api'
import { OT_THRESHOLD_HOURS } from '../../services/overtime'
import { formatYMD } from '../../services/leave'

/**
 * This cutoff's overtime so far against the 20-hour line. It reads the ACTIVE
 * cutoff, so it starts over at zero whenever a new cutoff is set — there is no
 * counter to reset. What's past the line becomes offset once the cutoff's DTR is
 * approved; until then this is a preview, and says so.
 */
export default function OvertimeCounter({ userId }) {
    const [state, setState] = useState(null) // null loading | { error } | counter

    useEffect(() => {
        let cancelled = false
        overtimeApi.getCounter(userId)
            .then(c => { if (!cancelled) setState(c) })
            .catch(e => { console.error('Load OT counter failed', e); if (!cancelled) setState({ error: true }) })
        return () => { cancelled = true }
    }, [userId])

    const shell = (children) => (
        <section className="bg-[var(--surface-1)] rounded-3xl border border-[var(--border)] p-5">{children}</section>
    )

    if (state === null) return shell(<Loader2 size={18} className="animate-spin text-[var(--text-muted)]" aria-label="Loading overtime" />)
    if (state.error) return shell(<p className="text-sm text-[var(--accent-red)]">Couldn’t load your overtime for this cutoff.</p>)
    if (!state.cutoff) return shell(<p className="text-sm text-[var(--text-muted)]">There is no active cutoff yet, so there is no overtime to count.</p>)

    const { hours, kept, excess, window: win, skipped } = state
    const pct = Math.min(100, (hours / OT_THRESHOLD_HOURS) * 100)
    const over = excess > 0

    return shell(
        <>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent-purple)] flex items-center gap-1.5"><Timer size={12} /> Overtime this cutoff</p>
                    <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-4xl font-bold text-[var(--text-primary)] tabular-nums">{hours}</span>
                        <span className="text-xs text-[var(--text-muted)]">of {OT_THRESHOLD_HOURS} hrs</span>
                    </div>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] text-right">{formatYMD(win.startYMD).replace(/ \d{4}$/, '')} – {formatYMD(win.endYMD).replace(/ \d{4}$/, '')}<br />resets with the next cutoff</p>
            </div>

            <div
                className="h-2 rounded-full bg-[var(--surface-3)] mt-4 overflow-hidden"
                role="img"
                aria-label={`${hours} of ${OT_THRESHOLD_HOURS} overtime hours this cutoff`}
            >
                <div style={{ width: `${pct}%`, background: over ? 'var(--accent-amber)' : 'var(--accent-purple)' }} className="h-full" />
            </div>

            <p className="text-xs text-[var(--text-secondary)] mt-3">
                {over
                    ? <><strong className="text-[var(--accent-amber)]">{excess} hr{excess === 1 ? '' : 's'}</strong> past {OT_THRESHOLD_HOURS} will be added to your offset when this cutoff’s DTR is approved. {kept} stay as overtime.</>
                    : <>{Math.round((OT_THRESHOLD_HOURS - hours) * 100) / 100} more hours until overtime starts turning into offset.</>}
            </p>
            {skipped > 0 && (
                <p className="text-xs text-[var(--accent-amber)] mt-2">
                    {skipped} OT {skipped === 1 ? 'entry has' : 'entries have'} a start without a valid end, so {skipped === 1 ? 'it isn’t' : 'they aren’t'} counted. Fix {skipped === 1 ? 'it' : 'them'} on your DTR.
                </p>
            )}
        </>
    )
}
