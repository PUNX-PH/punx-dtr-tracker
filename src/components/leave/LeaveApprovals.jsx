import { useMemo, useState } from 'react'
import { Check, X, Undo2, Inbox } from 'lucide-react'
import { leaveApi } from '../../services/api'
import { STATUS } from '../../services/leave'
import { RequestCard, inputClass } from './shared'

const PAGE = 15

/**
 * The approval queue. A senior sees requests from the people assigned to them;
 * an admin sees everyone's (they are HR, and the fallback when someone has no
 * senior). Nobody sees their own here — you cannot decide your own request, and
 * the rules refuse it anyway — those stay in "My requests".
 */
export default function LeaveApprovals({ user, isAdmin, requests, users, onChanged }) {
    const [busyId, setBusyId] = useState(null)
    const [errors, setErrors] = useState({})       // requestId -> message
    const [rejecting, setRejecting] = useState(null) // requestId with the note box open
    const [note, setNote] = useState('')
    const [filter, setFilter] = useState('all')
    const [shown, setShown] = useState(PAGE)

    const userById = useMemo(() => Object.fromEntries(users.map(u => [u.id, u])), [users])

    const inScope = useMemo(() => requests.filter(r => {
        if (r.userId === user.id) return false
        const emp = userById[r.userId]
        if (emp?.removed) return false
        return isAdmin || emp?.assignedSeniorId === user.id
    }), [requests, user.id, isAdmin, userById])

    const pending = inScope.filter(r => r.status === STATUS.PENDING)
    const decided = inScope.filter(r => r.status !== STATUS.PENDING && (filter === 'all' || r.status === filter))

    const decide = async (request, status, reviewNote = '') => {
        setBusyId(request.id)
        setErrors(prev => ({ ...prev, [request.id]: null }))
        const res = await leaveApi.review(request.id, status, user, reviewNote)
        setBusyId(null)
        if (res.success) {
            setRejecting(null)
            setNote('')
            onChanged?.()
        } else {
            setErrors(prev => ({ ...prev, [request.id]: res.message }))
        }
    }

    const handleRevoke = (request) => {
        const reason = window.prompt(`Revoke this approved ${request.type} request for ${request.userName}?\n\nIt comes off their DTR and the balance is returned. Add a note for them:`, '')
        if (reason === null) return
        decide(request, STATUS.REJECTED, reason)
    }

    const approverLabel = (request) => {
        if (!isAdmin) return null
        const senior = userById[userById[request.userId]?.assignedSeniorId]
        return (
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
                {senior ? `Assigned senior: ${senior.name}` : 'No senior assigned — needs an admin'}
            </p>
        )
    }

    const errorLine = (request) => errors[request.id] && (
        <p role="alert" className="text-xs text-[var(--accent-red)] bg-[var(--accent-red)]/10 border border-[var(--accent-red)]/20 rounded-lg px-3 py-2 mt-3">
            {errors[request.id]}
        </p>
    )

    return (
        <div className="space-y-6">
            <section className="bg-[var(--surface-1)] rounded-3xl border border-[var(--border)] p-4 sm:p-6">
                <h3 className="text-lg font-bold text-[var(--text-primary)]">Awaiting your decision</h3>
                <p className="text-xs text-[var(--text-muted)] mb-4">
                    {isAdmin ? 'Requests from everyone. Seniors see only their own people.' : 'Requests from the employees assigned to you.'}
                </p>

                {pending.length === 0 ? (
                    <div className="flex flex-col items-center py-10 text-[var(--text-muted)]">
                        <Inbox size={36} className="mb-2 opacity-30" />
                        <p className="text-sm">Nothing waiting on you.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {pending.map(r => (
                            <RequestCard
                                key={r.id}
                                request={r}
                                showEmployee
                                actions={rejecting === r.id ? null : (
                                    <>
                                        <button
                                            onClick={() => decide(r, STATUS.APPROVED)}
                                            disabled={busyId === r.id}
                                            className="flex items-center gap-1.5 px-4 py-2 bg-[var(--accent-green)] hover:bg-[var(--accent-green-hover)] disabled:opacity-50 text-black text-xs font-bold uppercase tracking-wider rounded-xl transition-colors"
                                        >
                                            <Check size={14} /> Approve
                                        </button>
                                        <button
                                            onClick={() => { setRejecting(r.id); setNote('') }}
                                            disabled={busyId === r.id}
                                            className="flex items-center gap-1.5 px-4 py-2 bg-[var(--accent-red)]/10 hover:bg-[var(--accent-red)]/20 text-[var(--accent-red)] border border-[var(--accent-red)]/20 disabled:opacity-50 text-xs font-bold uppercase tracking-wider rounded-xl transition-colors"
                                        >
                                            <X size={14} /> Reject
                                        </button>
                                    </>
                                )}
                            >
                                {approverLabel(r)}
                                {rejecting === r.id && (
                                    <div className="mt-3 space-y-2">
                                        <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                            Note to {r.userName || 'the employee'} <span className="normal-case font-medium">(optional)</span>
                                            <input
                                                autoFocus
                                                type="text"
                                                maxLength={500}
                                                className={`${inputClass} mt-1 normal-case font-normal`}
                                                value={note}
                                                onChange={(e) => setNote(e.target.value)}
                                                placeholder="Why it can’t be approved"
                                                onKeyDown={(e) => { if (e.key === 'Enter') decide(r, STATUS.REJECTED, note) }}
                                            />
                                        </label>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => decide(r, STATUS.REJECTED, note)}
                                                disabled={busyId === r.id}
                                                className="px-4 py-2 bg-[var(--accent-red)] hover:bg-[var(--accent-red-hover)] disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors"
                                            >
                                                Confirm reject
                                            </button>
                                            <button
                                                onClick={() => setRejecting(null)}
                                                className="px-4 py-2 bg-[var(--surface-3)] hover:bg-[var(--surface-3-hover)] text-[var(--text-secondary)] text-xs font-bold rounded-xl transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {errorLine(r)}
                            </RequestCard>
                        ))}
                    </div>
                )}
            </section>

            <section className="bg-[var(--surface-1)] rounded-3xl border border-[var(--border)] p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h3 className="text-lg font-bold text-[var(--text-primary)]">Decided</h3>
                    <select
                        value={filter}
                        onChange={(e) => { setFilter(e.target.value); setShown(PAGE) }}
                        className="bg-[var(--surface-3)] text-[var(--text-primary)] text-xs px-3 py-1.5 rounded-lg border border-[var(--border-strong)] focus:outline-none"
                        aria-label="Filter decided requests"
                    >
                        <option value="all">All</option>
                        <option value={STATUS.APPROVED}>Approved</option>
                        <option value={STATUS.REJECTED}>Rejected</option>
                    </select>
                </div>

                {decided.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)] py-6 text-center">No decided requests yet.</p>
                ) : (
                    <div className="space-y-3">
                        {decided.slice(0, shown).map(r => (
                            <RequestCard
                                key={r.id}
                                request={r}
                                showEmployee
                                actions={isAdmin && r.status === STATUS.APPROVED ? (
                                    <button
                                        onClick={() => handleRevoke(r)}
                                        disabled={busyId === r.id}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-3)] hover:bg-[var(--surface-3-hover)] disabled:opacity-50 text-[var(--text-secondary)] text-xs font-bold rounded-lg border border-[var(--border-strong)] transition-colors"
                                    >
                                        <Undo2 size={12} /> Revoke
                                    </button>
                                ) : null}
                            >
                                {errorLine(r)}
                            </RequestCard>
                        ))}
                        {decided.length > shown && (
                            <button
                                onClick={() => setShown(s => s + PAGE)}
                                className="w-full py-2 text-xs font-bold text-[var(--accent-purple)] hover:underline"
                            >
                                Show more ({decided.length - shown} left)
                            </button>
                        )}
                    </div>
                )}
            </section>
        </div>
    )
}
