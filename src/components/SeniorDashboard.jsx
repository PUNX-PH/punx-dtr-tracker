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
        <div className="flex flex-col h-full gap-6 animate-in fade-in duration-500">
            {/* Top Bar */}
            <div className="bg-[#141419] rounded-3xl border border-[#1f1f23] p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500">
                        <UserCheck size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white">Senior Dashboard</h2>
                        <p className="text-xs text-slate-500">Review DTRs from your assigned employees</p>
                    </div>
                </div>

                <div className="flex items-center gap-4 bg-[#1f1f23] p-2 rounded-xl border border-slate-800">
                    <div className="px-2">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Active Cutoff</p>
                        <select
                            className="text-xs text-white font-mono bg-[#1f1f23] border-none focus:outline-none cursor-pointer rounded px-1 py-0.5"
                            style={{ colorScheme: 'dark' }}
                            value={cutoff ? cutoff.id : ''}
                            onChange={(e) => {
                                const selectedId = e.target.value
                                setCutoff(cutoffs.find(c => c.id === selectedId) || null)
                            }}
                        >
                            <option value="" style={{ backgroundColor: '#1f1f23', color: '#fff' }}>Select Cutoff Period</option>
                            {cutoffs.map(c => (
                                <option key={c.id} value={c.id} style={{ backgroundColor: '#1f1f23', color: '#fff' }}>
                                    {`${new Date(c.startDate.toDate()).toLocaleDateString('en-GB')} - ${new Date(c.endDate.toDate()).toLocaleDateString('en-GB')}`}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="flex flex-1 gap-6 overflow-hidden">
                {/* User List Panel */}
                <div className="w-80 flex flex-col gap-4">
                    <div className="bg-[#141419] rounded-3xl border border-[#1f1f23] overflow-hidden flex flex-col h-full">
                        <div className="p-6 border-b border-[#1f1f23]">
                            <h2 className="text-xl font-bold text-white mb-1">Assigned Employees</h2>
                            <p className="text-xs text-slate-500 mb-4">{users.length} total</p>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 h-4 w-4" />
                                <input
                                    type="text"
                                    placeholder="Search employees..."
                                    className="w-full bg-[#1f1f23] text-white text-sm rounded-xl py-2 pl-9 pr-4 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {loading ? (
                                <div className="flex justify-center py-8 text-slate-500">
                                    <Loader2 className="animate-spin" />
                                </div>
                            ) : filteredUsers.length === 0 ? (
                                <div className="text-center py-12 px-4 text-slate-500 text-sm">
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
                                        ? 'bg-[#22c55e]/20 text-[#22c55e] border-[#22c55e]/20'
                                        : 'bg-amber-500/20 text-amber-500 border-amber-500/20'

                                    return (
                                        <button
                                            key={user.id}
                                            onClick={() => setSelectedUser(user)}
                                            className={`w-full text-left p-3 rounded-xl transition-all flex items-center gap-3 relative overflow-hidden group
                                                ${selectedUser?.id === user.id
                                                    ? 'bg-amber-500 text-black shadow-lg shadow-amber-900/20'
                                                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                                }`}
                                        >
                                            {isSubmitted && (
                                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${isApproved ? 'bg-[#22c55e]' : 'bg-amber-500'}`} />
                                            )}

                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0
                                                ${selectedUser?.id === user.id ? 'bg-black text-amber-500' : 'bg-[#1f1f23] text-slate-500'}`}>
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
                                                <p className={`text-xs truncate ${selectedUser?.id === user.id ? 'text-black/70' : 'text-slate-600'}`}>
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
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                    {selectedUser ? (
                        <div className="h-full flex flex-col gap-6 overflow-y-auto pr-2 pb-6">
                            {/* User Header */}
                            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                                <div>
                                    <h2 className="text-3xl font-bold text-white max-w-2xl truncate">{selectedUser.name}</h2>
                                    <div className="flex items-center gap-3 text-slate-500 mt-1">
                                        <span className="text-sm">ID: {selectedUser.id}</span>
                                    </div>
                                </div>

                                {/* Submission Status + Actions */}
                                {selectedSub ? (
                                    <div className="flex flex-col items-end gap-2">
                                        <div className="flex items-center gap-4 mb-2">
                                            {canAct ? (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleDTRAction('approved')}
                                                        className="px-4 py-2 bg-[#22c55e] hover:bg-[#16a34a] text-black text-xs font-bold uppercase tracking-wider rounded-xl transition-colors shadow-lg shadow-green-900/20"
                                                    >
                                                        Approve DTR
                                                    </button>
                                                    <button
                                                        onClick={() => handleDTRAction('rejected')}
                                                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors shadow-lg shadow-red-900/20"
                                                    >
                                                        Reject
                                                    </button>
                                                </div>
                                            ) : null}

                                            <p className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1
                                                ${selectedSub.status === 'approved' ? 'text-[#22c55e]' :
                                                  selectedSub.status === 'rejected' ? 'text-red-500' : 'text-amber-500'}`}>
                                                <span className={`w-2 h-2 rounded-full
                                                    ${selectedSub.status === 'approved' ? 'bg-[#22c55e]' :
                                                      selectedSub.status === 'rejected' ? 'bg-red-500' : 'bg-amber-500'}`}></span>
                                                DTR {selectedSub.status.toUpperCase().replace('PENDING_SENIOR', 'PENDING')}
                                            </p>
                                        </div>

                                        {/* Links */}
                                        {selectedSub.links && selectedSub.links.length > 0 && (
                                            <div className="flex flex-col gap-1 items-end w-full max-w-sm mb-2">
                                                {selectedSub.links.map((link, idx) => (
                                                    <a
                                                        key={`link-${idx}`}
                                                        href={link}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs text-[#3b82f6] hover:text-[#2563eb] underline break-all bg-[#1a1a22] p-2 rounded-lg border border-[#3b82f6]/20 w-fit text-right"
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
                                                <div className="flex flex-wrap gap-2 justify-end max-w-sm">
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
                                                            className="group relative block w-24 h-24 bg-[#1f1f23] rounded-lg border border-slate-700 overflow-hidden hover:border-amber-500 hover:ring-2 hover:ring-amber-500/20 transition-all cursor-pointer"
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
                                            <div className="mt-3 space-y-2 max-w-sm">
                                                <p className="text-[10px] text-[#8b5cf6] font-bold uppercase tracking-wider flex items-center gap-1">
                                                    <span>💬</span> Attachment Comments ({selectedSub.attachmentComments.length})
                                                </p>
                                                {selectedSub.attachmentComments.map((item, idx) => (
                                                    <div key={idx} className="p-2.5 bg-[#1f1f23] rounded-lg border border-slate-700">
                                                        <p className="text-[10px] text-slate-500 mb-1">{item.fileCount} file(s)</p>
                                                        <p className="text-xs text-slate-300 leading-relaxed">{item.comment}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <p className="text-[10px] text-slate-500 mt-1">
                                            {new Date(selectedSub.submittedAt.toDate()).toLocaleString()}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="px-4 py-2 rounded-xl bg-[#1f1f23] border border-[#1f1f23] text-slate-500 text-xs font-bold uppercase">
                                        No Submission Yet
                                    </div>
                                )}
                            </div>

                            {/* DTR Table (read-only — Senior can review but not edit) */}
                            {loadingHistory ? (
                                <div className="flex items-center justify-center p-12 bg-[#141419] rounded-3xl border border-[#1f1f23]">
                                    <Loader2 className="animate-spin text-amber-500" size={32} />
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
                        <div className="h-full flex flex-col items-center justify-center bg-[#141419] rounded-3xl border border-[#1f1f23] text-slate-500">
                            <UserIcon size={48} className="mb-4 opacity-20" />
                            <p className="text-lg font-medium">
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
