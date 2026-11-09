import { useMemo, useState } from 'react'
import { Check, Loader2, Search, X } from 'lucide-react'
import { leaveApi } from '../../services/api'
import { LEAVE_TYPES, LEAVE_TYPE_KEYS, STATUS, formatAmount, requestAmount } from '../../services/leave'
import { departmentName } from '../../services/org'
import { RequestCard } from '../leave/shared'
import { DepartmentSelect } from './controls'

const PAGE = 25
const selectClass = 'bg-[var(--surface-3)] text-[var(--text-primary)] text-sm px-3 py-2 rounded-lg border border-[var(--border-strong)] focus:outline-none focus:border-[var(--accent-purple)]'

/**
 * Every leave and offset request for the people a viewer manages (all of them
 * for HR), whatever its status. Read-only: deciding a request is the Leave &
 * Offset tab's Approvals, which belongs to the employee's senior and HR.
 *
 * A request keeps the department it was filed from, so a transfer does not
 * rewrite history — last year's leave stays with last year's department.
 */
export default function LeaveHistory({ user, requests, users, departments, scopeDepartments, onChanged }) {
    // Deciding and cancelling from here is a super admin's. Managers read this
    // list; the Leave & Offset tab's Approvals remains the senior/admin queue.
    const canManage = user?.role === 'super_admin'
    const [busy, setBusy] = useState(null)
    const [search, setSearch] = useState('')
    const [deptFilter, setDeptFilter] = useState('')
    const [type, setType] = useState('')
    const [status, setStatus] = useState('')
    const [year, setYear] = useState('')
    const [shown, setShown] = useState(PAGE)

    const names = useMemo(() => Object.fromEntries(users.map(u => [u.id, u])), [users])

    const years = useMemo(
        () => [...new Set(requests.map(r => r.startDate?.slice(0, 4)).filter(Boolean))].sort().reverse(),
        [requests]
    )

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return requests.filter(r => {
            if (deptFilter && (r.departmentId || names[r.userId]?.departmentId) !== deptFilter) return false
            if (type && r.type !== type) return false
            if (status && r.status !== status) return false
            if (year && !r.startDate?.startsWith(year)) return false
            if (q && !(r.userName || names[r.userId]?.name || '').toLowerCase().includes(q)) return false
            return true
        })
    }, [requests, names, search, deptFilter, type, status, year])

    // What was actually taken: approved only. Pending/rejected are history, not usage.
    const taken = useMemo(() => {
        const sums = { sick: 0, vacation: 0, offset: 0 }
        for (const r of filtered) if (r.status === STATUS.APPROVED) sums[r.type] += requestAmount(r)
        return sums
    }, [filtered])

    const reset = (fn) => (v) => { fn(v); setShown(PAGE) }

    // Goes through leaveApi.review — the single path every decision takes — so it
    // re-checks the balance on approve, moves the calendar entry in the same
    // write, and tells the employee. Cancelling an approved leave is a rejection
    // of it: the balance comes back by itself because "used" is derived.
    const decide = async (r, status) => {
        let note = ''
        if (status === STATUS.REJECTED) {
            const asked = window.prompt(
                r.status === STATUS.APPROVED
                    ? `Cancel ${r.userName || 'this'} approved leave? Add a reason — they will see it:`
                    : `Decline ${r.userName || 'this'} request? Add a reason (optional) — they will see it:`,
                ''
            )
            if (asked === null) return
            note = asked
        } else if (!window.confirm(`Approve ${r.userName || 'this'} request?`)) {
            return
        }
        setBusy(r.id)
        const res = await leaveApi.review(r.id, status, user, note)
        setBusy(null)
        if (!res.success) { alert(res.message); return }
        onChanged?.()
    }

    const actionsFor = (r) => {
        if (!canManage || r.userId === user.id) return null // never your own request
        const btn = 'flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors disabled:opacity-50'
        const spin = busy === r.id ? <Loader2 size={12} className="animate-spin" /> : null
        if (r.status === STATUS.PENDING) return (
            <>
                <button disabled={busy === r.id} onClick={() => decide(r, STATUS.APPROVED)} className={`${btn} bg-[var(--accent-green)]/15 text-[var(--accent-green)] border-[var(--accent-green)]/30 hover:bg-[var(--accent-green)]/25`}>{spin || <Check size={12} />} Approve</button>
                <button disabled={busy === r.id} onClick={() => decide(r, STATUS.REJECTED)} className={`${btn} bg-[var(--accent-red)]/10 text-[var(--accent-red)] border-[var(--accent-red)]/30 hover:bg-[var(--accent-red)]/20`}>{spin || <X size={12} />} Decline</button>
            </>
        )
        if (r.status === STATUS.APPROVED) return (
            <button disabled={busy === r.id} onClick={() => decide(r, STATUS.REJECTED)} className={`${btn} bg-[var(--surface-3)] text-[var(--text-secondary)] border-[var(--border-strong)] hover:text-[var(--accent-red)]`}>{spin || <X size={12} />} Cancel leave</button>
        )
        return null
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                        value={search}
                        onChange={(e) => reset(setSearch)(e.target.value)}
                        placeholder="Search people"
                        aria-label="Search people"
                        className={`${selectClass} pl-9 w-48`}
                    />
                </div>
                <DepartmentSelect departments={scopeDepartments} value={deptFilter} onChange={reset(setDeptFilter)} allLabel={scopeDepartments.length > 1 ? 'All my departments' : 'All departments'} />
                <select aria-label="Type" value={type} onChange={(e) => reset(setType)(e.target.value)} className={selectClass}>
                    <option value="">All types</option>
                    {LEAVE_TYPE_KEYS.map(k => <option key={k} value={k}>{LEAVE_TYPES[k].label}</option>)}
                </select>
                <select aria-label="Status" value={status} onChange={(e) => reset(setStatus)(e.target.value)} className={selectClass}>
                    <option value="">Any status</option>
                    <option value={STATUS.PENDING}>Pending</option>
                    <option value={STATUS.APPROVED}>Approved</option>
                    <option value={STATUS.REJECTED}>Rejected</option>
                </select>
                <select aria-label="Year" value={year} onChange={(e) => reset(setYear)(e.target.value)} className={selectClass}>
                    <option value="">All years</option>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
                {LEAVE_TYPE_KEYS.map(k => (
                    <div key={k} className="bg-[var(--surface-1)] border border-[var(--border)] rounded-2xl p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{LEAVE_TYPES[k].label} taken</p>
                        <p className="text-xl sm:text-2xl font-bold mt-1" style={{ color: LEAVE_TYPES[k].color }}>{formatAmount(k, taken[k])}</p>
                    </div>
                ))}
            </div>

            {filtered.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] text-center py-12 bg-[var(--surface-1)] border border-[var(--border)] rounded-3xl">
                    {requests.length === 0 ? 'No leave requests yet.' : 'Nothing matches those filters.'}
                </p>
            ) : (
                <>
                    <p className="text-xs text-[var(--text-muted)]">{filtered.length} request{filtered.length === 1 ? '' : 's'}</p>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {filtered.slice(0, shown).map(r => (
                            <RequestCard key={r.id} request={r} showEmployee actions={actionsFor(r)}>
                                <p className="text-[10px] text-[var(--text-muted)] mt-1">{departmentName(departments, r.departmentId || names[r.userId]?.departmentId)}</p>
                            </RequestCard>
                        ))}
                    </div>
                    {filtered.length > shown && (
                        <div className="flex justify-center">
                            <button onClick={() => setShown(n => n + PAGE)} className="px-4 py-2 text-xs font-bold rounded-xl bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                                Show more ({filtered.length - shown} left)
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
