import { useEffect, useState } from 'react'
import { Info, X } from 'lucide-react'
import { DEFAULT_ALLOTMENT, HOURS_PER_DAY } from '../../services/leave'
import { OFFSET_WARN_HOURS, OT_THRESHOLD_HOURS, MAX_OT_SESSION_HOURS } from '../../services/overtime'

function Section({ title, children }) {
    return (
        <section>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">{title}</h4>
            <ul className="space-y-2 text-sm text-[var(--text-secondary)] leading-relaxed list-disc pl-5 marker:text-[var(--text-muted)]">{children}</ul>
        </section>
    )
}

/**
 * The "ⓘ" next to the Leave & Offset title: how leave, offset and overtime are
 * calculated, in plain words. Every number in it comes from the same constants
 * the code uses (leave.js, overtime.js), so this can't say 20 while the maths
 * says something else.
 */
export default function HowItWorks({ isSuperAdmin = false }) {
    const [open, setOpen] = useState(false)

    useEffect(() => {
        if (!open) return
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open])

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="How leave, offset and overtime are calculated"
                title="How this is calculated"
                className="p-1.5 rounded-full text-[var(--text-muted)] hover:text-[var(--accent-purple)] hover:bg-[var(--surface-3)] transition-colors"
            >
                <Info size={18} />
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="How leave, offset and overtime are calculated"
                        className="bg-[var(--surface-1)] border border-[var(--border-strong)] rounded-2xl shadow-2xl w-full max-w-xl max-h-[90dvh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-4 sm:p-6 border-b border-[var(--border)] flex items-start justify-between gap-3 shrink-0">
                            <div>
                                <h3 className="text-lg font-bold text-[var(--text-primary)]">How this is calculated</h3>
                                <p className="text-xs text-[var(--text-muted)]">Leave, offset hours and overtime</p>
                            </div>
                            <button onClick={() => setOpen(false)} aria-label="Close" className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-colors"><X size={18} /></button>
                        </div>

                        <div className="p-4 sm:p-6 space-y-6 overflow-y-auto overscroll-contain">
                            <Section title="Sick & vacation leave">
                                <li>Counted in <strong>working days, Monday to Friday</strong>. Weekends inside a range are not charged. Holidays are not excluded yet, so a holiday inside a range still counts as a day.</li>
                                <li>New people start with <strong>{DEFAULT_ALLOTMENT.sick} sick</strong> and <strong>{DEFAULT_ALLOTMENT.vacation} vacation</strong> days until HR sets their balance.</li>
                                <li>For <strong>part of a day</strong> — a half day, an afternoon — choose “Part of a day” and enter the hours (half-hour steps, one date, up to {HOURS_PER_DAY}). It uses hours ÷ {HOURS_PER_DAY} of a day, so 4 hours is half a day.</li>
                                <li><strong>Remaining</strong> = granted − used. Only <em>approved</em> requests are used.</li>
                                <li><strong>Pending</strong> requests are set aside: they can’t be spent twice, but they aren’t used until approved.</li>
                            </Section>

                            <Section title="Offset hours">
                                <li>Offset is counted in <strong>hours</strong>. One request is for a single weekday, in half-hour steps, up to <strong>{HOURS_PER_DAY} hours</strong>.</li>
                                <li>You get offset two ways: HR grants it, or overtime is converted (below). <strong>Granted</strong> = both added together.</li>
                                <li>Same rule as leave: <strong>remaining</strong> = granted − used, and pending requests are set aside.</li>
                                <li>There is no maximum balance.{isSuperAdmin && <> Super admins see a warning once someone has more than <strong>{OFFSET_WARN_HOURS} hours</strong> remaining. It’s a flag only — the extra hours still count.</>}</li>
                            </Section>

                            <Section title="Overtime → offset">
                                <li>Overtime is added up <strong>per cutoff</strong> from the OT in/out times on your DTR. The counter <strong>starts again at zero</strong> with every new cutoff.</li>
                                <li>The first <strong>{OT_THRESHOLD_HOURS} hours</strong> of a cutoff stay ordinary overtime.</li>
                                <li>Every hour <strong>past {OT_THRESHOLD_HOURS}</strong> becomes offset, 1 hour of overtime = 1 hour of offset. Example: {OT_THRESHOLD_HOURS + 6.5} hours of OT → {OT_THRESHOLD_HOURS} stay overtime, 6.5 become offset.</li>
                                <li>It is credited when your DTR for that cutoff is <strong>approved</strong>. What was approved is what counts — changing your DTR afterwards doesn’t change it.</li>
                                <li>OT that runs past midnight counts: 6:00 PM to 2:00 AM is 8 hours. An OT entry with a start but no end, or one that would run longer than {MAX_OT_SESSION_HOURS} hours (usually a wrong AM/PM), is skipped. Fix it before submitting so it counts.</li>
                            </Section>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
