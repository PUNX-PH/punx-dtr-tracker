import { useState, useEffect } from 'react'
import { Search, User as UserIcon, Loader2, UserCheck } from 'lucide-react'
import { api } from '../services/api'
import DTRTable from './DTRTable'
import RecentActivityTable from './RecentActivityTable'

export default function SeniorDashboard({ currentUser, focusRequest, onFocusHandled }) {
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [selectedUser, setSelectedUser] = useState(null)
    const [userHistory, setUserHistory] = useState([])
    const [loadingHistory, setLoadingHistory] = useState(false)
    const [cutoff, setCutoff] = useState(null)
    const [cutoffs, setCutoffs] = useState([])
    const [submissions, setSubmissions] = useState({})

    useEffect(() => {
        loadUsers()
        loadCutoffs()
    }, [])

    useEffect(() => {
        if (cutoff) loadSubmissions()
    }, [cutoff])

    useEffect(() => {
        if (selectedUser) loadHistory(selectedUser.id)
    }, [selectedUser])

    // Jump here from a notification click (e.g. "DTR Approval Required") —
    // wait for the assigned-employee list to finish loading, then auto-select
    // the employee (and their cutoff, if it still exists) named in the notification.
    useEffect(() => {
        if (!focusRequest?.employeeId || loading) return
        const target = users.find(u => u.id === focusRequest.employeeId)
        if (target) {
            setSelectedUser(target)
            if (focusRequest.cutoffId) {
                const targetCutoff = cutoffs.find(c => c.id === focusRequest.cutoffId)
                if (targetCutoff) setCutoff(targetCutoff)
            }
        }
        onFocusHandled?.()
    }, [focusRequest, loading])

    const loadUsers = async () => {
        setLoading(true)
        const data = await api.getAllUsers()
        // Only employees assigned to this senior. Super-admins viewing this
        // dashboard will see only the people who have *them* set as senior;
        // if none, the list is intentionally empty.
        const assigned = data.filter(u => u.assignedSeniorId === currentUser.id)
        setUsers(assigned)
        setLoading(false)
    }

    const loadCutoffs = async () => {
        const allCutoffs = await api.getAllCutoffs()
        setCutoffs(allCutoffs)
        const active = await api.getActiveCutoff()
        if (active) setCutoff(active)
        else if (allCutoffs.length > 0) setCutoff(allCutoffs[0])
    }

    const loadSubmissions = async () => {
        if (!cutoff) return
        const subs = await api.getSubmissionsForCutoff(cutoff.id)
        const subMap = {}
        subs.forEach(s => { subMap[s.userId] = s })
        setSubmissions(subMap)
    }

    const loadHistory = async (userId) => {
        setLoadingHistory(true)
        const data = await api.getHistory(userId)
        setUserHistory(data)
        setLoadingHistory(false)
    }

    const getSubmissionStatus = (userId) => submissions[userId]

    const handleDTRAction = async (status) => {
        const sub = getSubmissionStatus(selectedUser.id)
        if (!sub) return
        if (!window.confirm(`Are you sure you want to ${status === 'approved' ? 'Approve' : 'Reject'} this DTR?`)) return

        const res = await api.updateDTRStatus(sub.id, status, selectedUser.id, currentUser.name)
        if (res.success) {
            alert(`DTR successfully ${status === 'approved' ? 'approved' : 'rejected'}`)
            loadSubmissions()
        } else {
            alert('Failed to update status: ' + res.message)
        }
    }

    const filteredUsers = users
        .filter(u =>
            u.name?.toLowerCase().includes(search.toLowerCase()) ||
            u.email?.toLowerCase().includes(search.toLowerCase())
        )
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

    const selectedSub = selectedUser ? getSubmissionStatus(selectedUser.id) : null
    const canAct = selectedSub && ['pending', 'pending_senior'].includes(selectedSub.status)

    return (
        <div className="flex flex-col lg:h-full gap-4 sm:gap-6 animate-in fade-in duration-500">
            {/* Top Bar */}
            <div className="bg-[var(--surface-1)] rounded-3xl border border-[var(--border)] p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-[var(--accent-amber)]/10 rounded-xl text-[var(--accent-amber)]">
                        <UserCheck size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-[var(--text-primary)]">Senior Dashboard</h2>
                        <p className="text-xs text-[var(--text-muted)]">Review DTRs from your assigned employees</p>
                    </div>
                </div>

                <div className="w-full md:w-auto flex flex-wrap md:flex-nowrap items-center gap-4 bg-[var(--surface-3)] p-2 rounded-xl border border-[var(--border-strong)]">
                    <div className="px-2">
                        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-bold">Active Cutoff</p>
                        <select
                            className="text-xs text-[var(--text-primary)] font-mono bg-[var(--surface-3)] border-none focus:outline-none cursor-pointer rounded px-1 py-0.5"
                            value={cutoff ? cutoff.id : ''}
                            onChange={(e) => {
                                const selectedId = e.target.value
                                setCutoff(cutoffs.find(c => c.id === selectedId) || null)
                            }}
                        >
                            <option value="" style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)' }}>Select Cutoff Period</option>
                            {cutoffs.map(c => (
                                <option key={c.id} value={c.id} style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)' }}>
                                    {`${new Date(c.startDate.toDate()).toLocaleDateString('en-GB')} - ${new Date(c.endDate.toDate()).toLocaleDateString('en-GB')}`}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row flex-1 min-h-0 gap-4 lg:gap-6 lg:overflow-hidden">
                {/* User List Panel */}
                <div className="w-full lg:w-80 shrink-0 flex flex-col gap-4">
                    <div className="bg-[var(--surface-1)] rounded-3xl border border-[var(--border)] overflow-hidden flex flex-col lg:h-full">
                        <div className="p-4 sm:p-6 border-b border-[var(--border)]">
                            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">Assigned Employees</h2>
                            <p className="text-xs text-[var(--text-muted)] mb-4">{users.length} total</p>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] h-4 w-4" />
                                <input
                                    type="text"
                                    placeholder="Search employees..."
                                    className="w-full bg-[var(--surface-3)] text-[var(--text-primary)] text-sm rounded-xl py-2 pl-9 pr-4 focus:outline-none focus:ring-1 focus:ring-[var(--accent-amber)]"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex-1 max-h-[45dvh] lg:max-h-none overflow-y-auto overscroll-contain p-2 space-y-1">
                            {loading ? (
                                <div className="flex justify-center py-8 text-[var(--text-muted)]">
                                    <Loader2 className="animate-spin" />
                                </div>
                            ) : filteredUsers.length === 0 ? (
                                <div className="text-center py-12 px-4 text-[var(--text-muted)] text-sm">
                                    {users.length === 0
                                        ? 'No employees assigned to you yet. Ask an admin to assign you employees.'
                                        : 'No employees match your search.'}
                                </div>
                            ) : (
                                filteredUsers.map(user => {
                                    const submission = getSubmissionStatus(user.id)
                                    const isSubmitted = !!submission && submission.status !== 'rejected'
                                    const isApproved = submission?.status === 'approved'
                                    const badgeColor = isApproved
                                        ? 'bg-[var(--accent-green)]/20 text-[var(--accent-green)] border-[var(--accent-green)]/20'
                                        : 'bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border-[var(--accent-amber)]/20'

                                    return (
                                        <button
                                            key={user.id}
                                            onClick={() => setSelectedUser(user)}
                                            className={`w-full text-left p-3 rounded-xl transition-all flex items-center gap-3 relative overflow-hidden group
                                                ${selectedUser?.id === user.id
                                                    ? 'bg-[var(--accent-amber)] text-black shadow-lg shadow-amber-900/20'
                                                    : 'text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]'
                                                }`}
                                        >
                                            {isSubmitted && (
                                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${isApproved ? 'bg-[var(--accent-green)]' : 'bg-[var(--accent-amber)]'}`} />
                                            )}

                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0
                                                ${selectedUser?.id === user.id ? 'bg-black text-[var(--accent-amber)]' : 'bg-[var(--surface-3)] text-[var(--text-muted)]'}`}>
                                                {user.name?.charAt(0) || '?'}
                                            </div>

                                            <div className="overflow-hidden flex-1 flex flex-col justify-center">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-bold truncate max-w-[120px]">{user.name || 'Unknown'}</p>
                                                    {isSubmitted && (
                                                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0 border ${badgeColor}`}>
                                                            SENT
                                                        </span>
                                                    )}
                                                </div>
                                                <p className={`text-xs truncate ${selectedUser?.id === user.id ? 'text-black/70' : 'text-[var(--text-muted)]'}`}>
                                                    {user.email}
                                                </p>
                                            </div>
                                        </button>
                                    )
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Panel: Selected User Detail */}
                <div className="flex-1 min-w-0 flex flex-col lg:h-full lg:overflow-hidden">
                    {selectedUser ? (
                        <div className="flex flex-col gap-6 lg:h-full lg:overflow-y-auto lg:pr-2 pb-6">
                            {/* User Header */}
                            <div className="flex flex-col lg:flex-row justify-between items-start gap-4">
                                <div className="min-w-0 w-full lg:w-auto">
                                    <h2 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] max-w-full lg:max-w-2xl truncate">{selectedUser.name}</h2>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[var(--text-muted)] mt-1">
                                        <span className="text-xs sm:text-sm break-anywhere">ID: {selectedUser.id}</span>
                                    </div>
                                </div>

                                {/* Submission Status + Actions */}
                                {selectedSub ? (
                                    <div className="w-full lg:w-auto flex flex-col items-start lg:items-end gap-2">
                                        <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-2">
                                            {canAct ? (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleDTRAction('approved')}
                                                        className="px-4 py-2 bg-[var(--accent-green)] hover:bg-[var(--accent-green-hover)] text-black text-xs font-bold uppercase tracking-wider rounded-xl transition-colors shadow-lg shadow-green-900/20"
                                                    >
                                                        Approve DTR
                                                    </button>
                                                    <button
                                                        onClick={() => handleDTRAction('rejected')}
                                                        className="px-4 py-2 bg-[var(--accent-red)] hover:bg-[var(--accent-red-hover)] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors shadow-lg shadow-red-900/20"
                                                    >
                                                        Reject
                                                    </button>
                                                </div>
                                            ) : null}

                                            <p className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1
                                                ${selectedSub.status === 'approved' ? 'text-[var(--accent-green)]' :
                                                  selectedSub.status === 'rejected' ? 'text-[var(--accent-red)]' : 'text-[var(--accent-amber)]'}`}>
                                                <span className={`w-2 h-2 rounded-full
                                                    ${selectedSub.status === 'approved' ? 'bg-[var(--accent-green)]' :
                                                      selectedSub.status === 'rejected' ? 'bg-[var(--accent-red)]' : 'bg-[var(--accent-amber)]'}`}></span>
                                                DTR {selectedSub.status.toUpperCase().replace('PENDING_SENIOR', 'PENDING')}
                                            </p>
                                        </div>

                                        {/* Links */}
                                        {selectedSub.links && selectedSub.links.length > 0 && (
                                            <div className="flex flex-col gap-1 items-start lg:items-end w-full max-w-full lg:max-w-sm mb-2">
                                                {selectedSub.links.map((link, idx) => (
                                                    <a
                                                        key={`link-${idx}`}
                                                        href={link}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)] underline break-all bg-[var(--surface-2)] p-2 rounded-lg border border-[var(--accent-blue)]/20 max-w-full lg:w-fit lg:text-right"
                                                    >
                                                        {link}
                                                    </a>
                                                ))}
                                            </div>
                                        )}

                                        {/* Image Attachments */}
                                        {(() => {
                                            const attachments = selectedSub.attachments || (selectedSub.attachmentUrl ? [selectedSub.attachmentUrl] : [])
                                            if (attachments.length === 0) return null
                                            return (
                                                <div className="flex flex-wrap gap-2 justify-start lg:justify-end max-w-full lg:max-w-sm">
                                                    {attachments.map((url, idx) => (
                                                        <button
                                                            key={idx}
                                                            onClick={() => {
                                                                const link = document.createElement('a')
                                                                link.href = url
                                                                link.download = `DTR_${selectedUser.name}_${idx + 1}_${new Date().toISOString().split('T')[0]}.png`
                                                                document.body.appendChild(link)
                                                                link.click()
                                                                document.body.removeChild(link)
                                                            }}
                                                            className="group relative block w-24 h-24 bg-[var(--surface-3)] rounded-lg border border-[var(--border-strong)] overflow-hidden hover:border-[var(--accent-amber)] hover:ring-2 hover:ring-[var(--accent-amber)]/20 transition-all cursor-pointer"
                                                            title={`Click to Download Image ${idx + 1}`}
                                                        >
                                                            <img
                                                                src={url}
                                                                alt={`Attachment ${idx + 1}`}
                                                                className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                                                            />
                                                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <span className="text-[9px] bg-black text-white px-1.5 py-0.5 rounded font-bold">
                                                                    Download
                                                                </span>
                                                            </div>
                                                            {attachments.length > 1 && (
                                                                <span className="absolute bottom-0 right-0 bg-black/50 text-white text-[9px] px-1">
                                                                    {idx + 1}
                                                                </span>
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            )
                                        })()}

                                        {selectedSub.attachmentComments && selectedSub.attachmentComments.length > 0 && (
                                            <div className="mt-3 space-y-2 w-full max-w-full lg:max-w-sm">
                                                <p className="text-[10px] text-[var(--accent-purple)] font-bold uppercase tracking-wider flex items-center gap-1">
                                                    <span>💬</span> Attachment Comments ({selectedSub.attachmentComments.length})
                                                </p>
                                                {selectedSub.attachmentComments.map((item, idx) => (
                                                    <div key={idx} className="p-2.5 bg-[var(--surface-3)] rounded-lg border border-[var(--border-strong)]">
                                                        <p className="text-[10px] text-[var(--text-muted)] mb-1">{item.fileCount} file(s)</p>
                                                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{item.comment}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <p className="text-[10px] text-[var(--text-muted)] mt-1">
                                            {new Date(selectedSub.submittedAt.toDate()).toLocaleString()}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="px-4 py-2 rounded-xl bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-muted)] text-xs font-bold uppercase">
                                        No Submission Yet
                                    </div>
                                )}
                            </div>

                            {/* DTR Table (read-only — Senior can review but not edit) */}
                            {loadingHistory ? (
                                <div className="flex items-center justify-center p-12 bg-[var(--surface-1)] rounded-3xl border border-[var(--border)]">
                                    <Loader2 className="animate-spin text-[var(--accent-amber)]" size={32} />
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <DTRTable
                                        user={selectedUser}
                                        history={userHistory}
                                        onRefresh={() => loadHistory(selectedUser.id)}
                                        initialDate={cutoff ? cutoff.startDate.toDate() : null}
                                        periodEnd={cutoff ? cutoff.endDate.toDate() : null}
                                        canEdit={false}
                                    />
                                    <RecentActivityTable history={userHistory} />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="h-full py-16 lg:py-0 px-6 text-center flex flex-col items-center justify-center bg-[var(--surface-1)] rounded-3xl border border-[var(--border)] text-[var(--text-muted)]">
                            <UserIcon size={48} className="mb-4 opacity-20" />
                            <p className="text-base sm:text-lg font-medium">
                                {users.length === 0
                                    ? 'No employees are assigned to you yet'
                                    : 'Select an employee to review their DTR'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
