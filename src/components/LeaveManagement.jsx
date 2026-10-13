import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Loader2, X } from 'lucide-react'
import { api, leaveApi } from '../services/api'
import { STATUS } from '../services/leave'
import LeaveBalanceCards from './leave/LeaveBalanceCards'
import LeaveRequestForm from './leave/LeaveRequestForm'
import LeaveApprovals from './leave/LeaveApprovals'
import LeaveBalancesAdmin from './leave/LeaveBalancesAdmin'
import { RequestCard } from './leave/shared'

/**
 * Sick leave, vacation leave and offset hours, end to end:
 *   My leave   — balances, file a request, track its status
 *   Approvals  — seniors (their people) and admins (everyone) decide requests
 *   Balances   — admins grant/adjust balances
 * Approved requests show up on the DTR by themselves (DTRTable `leaves`).
 */
export default function LeaveManagement({ user }) {
    const isAdmin = ['admin', 'super_admin'].includes(user.role)
    const isApprover = isAdmin || user.isSenior === true

    const [tab, setTab] = useState('my')
    const [mine, setMine] = useState(null)      // { allotted, requests, summary }
    const [staff, setStaff] = useState(null)    // { requests, users, allotted } — approvers only
    const [error, setError] = useState('')

    const loadMine = useCallback(async () => {
        try {
            setMine(await leaveApi.getOverview(user.id))
            setError('')
        } catch (e) {
            console.error('Load leave failed', e)
            setError(e.code === 'permission-denied'
                ? 'Leave & offset is not switched on yet — the latest Firestore rules need to be published.'
                : `Could not load your leave: ${e.message}`)
        }
    }, [user.id])

    const loadStaff = useCallback(async () => {
        if (!isApprover) return
        try {
            const [requests, users, allotted] = await Promise.all([
                leaveApi.getRequests(),
                api.getAllUsers(),
                isAdmin ? leaveApi.getAllAllotted() : Promise.resolve({}),
            ])
            setStaff({ requests, users, allotted })
        } catch (e) {
            console.error('Load approvals failed', e)
            setError(`Could not load approvals: ${e.message}`)
        }
    }, [isApprover, isAdmin])

    useEffect(() => { loadMine() }, [loadMine])
    useEffect(() => { loadStaff() }, [loadStaff])

    // A decision or an adjustment can change what this person sees of themselves
    // (an admin adjusting their own balance, say) — refresh both sides.
    const refreshAll = () => { loadMine(); loadStaff() }

    const handleCancel = async (request) => {
        if (!window.confirm('Withdraw this request?')) return
        const res = await leaveApi.cancel(request.id)
        if (res.success) loadMine()
        else alert('Could not withdraw: ' + res.message)
    }

    const pendingForMe = staff
        ? staff.requests.filter(r => {
            if (r.status !== STATUS.PENDING || r.userId === user.id) return false
            const emp = staff.users.find(u => u.id === r.userId)
            if (emp?.removed) return false
            return isAdmin || emp?.assignedSeniorId === user.id
        }).length
        : 0

    const tabs = [
        { id: 'my', label: 'My leave' },
        ...(isApprover ? [{ id: 'approvals', label: 'Approvals', badge: pendingForMe }] : []),
        ...(isAdmin ? [{ id: 'balances', label: 'Balances' }] : []),
    ]

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-[var(--accent-purple)]/10 rounded-xl text-[var(--accent-purple)]">
                    <CalendarDays size={22} />
                </div>
                <div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">Leave & Offset</h2>
                    <p className="text-[var(--text-muted)] text-sm">Sick leave, vacation leave and offset hours</p>
                </div>
            </div>

            {tabs.length > 1 && (
                <div role="tablist" className="flex items-center gap-2 bg-[var(--surface-1)] rounded-2xl border border-[var(--border)] p-1.5 w-full sm:w-fit">
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            role="tab"
                            aria-selected={tab === t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-colors
                                ${tab === t.id ? 'bg-[var(--accent-purple)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                        >
                            {t.label}
                            {t.badge > 0 && (
                                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--accent-red)] text-white text-[10px] flex items-center justify-center">{t.badge}</span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {error && (
                <p role="alert" className="text-sm text-[var(--accent-red)] bg-[var(--accent-red)]/10 border border-[var(--accent-red)]/20 rounded-2xl px-4 py-3">{error}</p>
            )}

            {tab === 'my' && (
                !mine ? (
                    !error && <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[var(--accent-purple)]" size={32} /></div>
                ) : (
                    <>
                        <LeaveBalanceCards summary={mine.summary} />

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                            <LeaveRequestForm user={user} summary={mine.summary} requests={mine.requests} onSubmitted={refreshAll} />

                            <section className="bg-[var(--surface-1)] rounded-3xl border border-[var(--border)] p-4 sm:p-6">
                                <h3 className="text-lg font-bold text-[var(--text-primary)]">My requests</h3>
                                <p className="text-xs text-[var(--text-muted)] mb-4">Approved ones appear on your DTR automatically.</p>
                                {mine.requests.length === 0 ? (
                                    <p className="text-sm text-[var(--text-muted)] py-8 text-center">You haven’t filed any requests yet.</p>
                                ) : (
                                    <div className="space-y-3 max-h-[640px] overflow-y-auto overscroll-contain pr-1">
                                        {mine.requests.map(r => (
                                            <RequestCard
                                                key={r.id}
                                                request={r}
                                                actions={r.status === STATUS.PENDING ? (
                                                    <button
                                                        onClick={() => handleCancel(r)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-3)] hover:bg-[var(--surface-3-hover)] text-[var(--text-secondary)] text-xs font-bold rounded-lg border border-[var(--border-strong)] transition-colors"
                                                    >
                                                        <X size={12} /> Withdraw
                                                    </button>
                                                ) : null}
                                            />
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>
                    </>
                )
            )}

            {tab === 'approvals' && isApprover && (
                staff
                    ? <LeaveApprovals user={user} isAdmin={isAdmin} requests={staff.requests} users={staff.users} onChanged={refreshAll} />
                    : <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[var(--accent-purple)]" size={32} /></div>
            )}

            {tab === 'balances' && isAdmin && (
                staff
                    ? <LeaveBalancesAdmin admin={user} users={staff.users} requests={staff.requests} allotted={staff.allotted} onChanged={refreshAll} />
                    : <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[var(--accent-purple)]" size={32} /></div>
            )}
        </div>
    )
}
