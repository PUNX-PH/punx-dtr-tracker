import { useState, useEffect } from 'react'
import { Search, User as UserIcon, Loader2, FileSpreadsheet, Users, Folder } from 'lucide-react'
import * as XLSX from 'xlsx'
import { api } from '../services/api'
import DTRTable from './DTRTable'
import RecentActivityTable from './RecentActivityTable'
import CutoffsView from './CutoffsView'

export default function AdminDashboard({ currentUser, focusRequest, onFocusHandled }) {
    const isSuperAdmin = currentUser.role === 'super_admin'
    const [view, setView] = useState('employees') // 'employees' | 'cutoffs' (cutoffs is super_admin only)
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [selectedUser, setSelectedUser] = useState(null)
    const [userHistory, setUserHistory] = useState([])
    const [loadingHistory, setLoadingHistory] = useState(false)
    const [cutoff, setCutoff] = useState(null)
    const [cutoffs, setCutoffs] = useState([]) // List of all available cutoffs
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [submissions, setSubmissions] = useState({}) // Map userId -> submission

    useEffect(() => {
        loadUsers()
        loadCutoffs()
    }, [])

    useEffect(() => {
        if (cutoff) {
            loadSubmissions()
        }
    }, [cutoff])

    useEffect(() => {
        if (selectedUser) {
            loadHistory(selectedUser.id)
        }
    }, [selectedUser])

    // Jump here from a notification click (e.g. "DTR Approval Required") —
    // wait for the employee list to finish loading, then auto-select the
    // employee (and their cutoff, if it still exists) named in the notification.
    useEffect(() => {
        if (!focusRequest?.employeeId || loading) return
        const target = users.find(u => u.id === focusRequest.employeeId)
        if (target) {
            setView('employees')
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
        setUsers(data)
        setLoading(false)
    }

    const loadCutoffs = async () => {
        // Load all for the dropdown
        const allCutoffs = await api.getAllCutoffs()
        setCutoffs(allCutoffs)

        // Set active/latest as current if not set
        const active = await api.getActiveCutoff()
        if (active) {
            setCutoff(active)
        } else if (allCutoffs.length > 0) {
            setCutoff(allCutoffs[0])
        }
    }

    const loadSubmissions = async () => {
        if (!cutoff) return
        const subs = await api.getSubmissionsForCutoff(cutoff.id)
        const subMap = {}
        subs.forEach(s => {
            subMap[s.userId] = s
        })
        setSubmissions(subMap)
    }

    const handleDTRAction = async (status) => {
        const sub = getSubmissionStatus(selectedUser.id);
        if (!sub) return;

        if (!window.confirm(`Are you sure you want to ${status === 'approved' ? 'Approve' : 'Reject'} this DTR?`)) return;

        const res = await api.updateDTRStatus(sub.id, status, selectedUser.id, currentUser.name);
        if (res.success) {
            alert(`DTR successfully ${status === 'approved' ? 'approved' : 'rejected'}`);
            loadSubmissions();
        } else {
            alert("Failed to update status: " + res.message);
        }
    }

    const handleSetCutoff = async () => {
        if (!startDate || !endDate) return alert("Please select start and end dates")
        const res = await api.setCutoff(startDate, endDate)
        if (res.success) {
            alert("New Cutoff Period Set!")
            loadCutoff()
        } else {
            alert("Failed to set cutoff")
        }
    }

    const loadHistory = async (userId) => {
        setLoadingHistory(true)
        const data = await api.getHistory(userId)
        setUserHistory(data)
        setLoadingHistory(false)
    }

    const filteredUsers = users
        .filter(u =>
            u.name?.toLowerCase().includes(search.toLowerCase()) ||
            u.email?.toLowerCase().includes(search.toLowerCase())
        )
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

    const getSubmissionStatus = (userId) => {
        return submissions[userId]
    }

    const handleExportDTR = () => {
        if (!selectedUser) return

        let start, end;

        if (cutoff) {
            start = cutoff.startDate.toDate();
            end = cutoff.endDate.toDate();
        } else {
            // Fallback if no cutoff is selected (e.g. export all or something? but DTRTable allows viewing history)
            // For now let's enforce cutoff for simplified export
            if (userHistory.length === 0) return alert("No history to export");
            // Just take the range from the history?
            // Let's rely on the current view which is driven by cutoff
            alert("Please select a cutoff period to export.");
            return;
        }

        const dates = [];
        // Generate dates
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            dates.push(new Date(d));
        }

        const exportData = dates.map(date => {
            const dateStr = date.toLocaleDateString('en-GB');
            const dayStr = date.toLocaleDateString('en-GB', { weekday: 'long' });

            const findLog = (type) => userHistory.find(h =>
                new Date(h.timestamp).toDateString() === date.toDateString() &&
                h.type === type
            );

            // Reason logic: find any log for the date
            const findAnyLog = () => userHistory.find(h =>
                h.type !== 'EDIT' && new Date(h.timestamp).toDateString() === date.toDateString()
            );

            const formatTime = (log) => log ? new Date(log.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }) : '';

            // Split OT: a day can have multiple OT_IN/OT_OUT pairs, distinguished
            // by a `session` index. Join them into one "9:00 AM-10:00 AM, 3:00 PM-6:00 PM" cell.
            const otLogs = userHistory.filter(h =>
                (h.type === 'OT_IN' || h.type === 'OT_OUT') &&
                new Date(h.timestamp).toDateString() === date.toDateString()
            );
            const otBySession = {};
            otLogs.forEach(l => {
                const s = l.session || 0;
                otBySession[s] = otBySession[s] || {};
                otBySession[s][l.type] = l;
            });
            const otSessions = Object.keys(otBySession)
                .sort((a, b) => a - b)
                .map(s => `${formatTime(otBySession[s].OT_IN) || '—'}-${formatTime(otBySession[s].OT_OUT) || '—'}`)
                .join(', ');

            return {
                Date: dateStr,
                Day: dayStr,
                "Time In": formatTime(findLog('IN')),
                "Time Out": formatTime(findLog('OUT')),
                "Overtime": otSessions,
                "Notes": findAnyLog()?.reason || ''
            };
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);

        // Adjust column widths
        const wscols = [
            { wch: 15 }, // Date
            { wch: 15 }, // Day
            { wch: 15 }, // In
            { wch: 15 }, // Out
            { wch: 30 }, // Overtime
            { wch: 30 }  // Notes
        ];
        ws['!cols'] = wscols;

        XLSX.utils.book_append_sheet(wb, ws, "DTR Record");

        const fileName = `DTR_${selectedUser.name.replace(/\s+/g, '_')}_${start.toISOString().split('T')[0]}_to_${end.toISOString().split('T')[0]}.xlsx`;

        XLSX.writeFile(wb, fileName);
    }

    const handleUpdateRole = async (newRole) => {
        if (!selectedUser) return;
        
        let roleName = newRole === 'super_admin' ? 'Super Admin' : (newRole === 'admin' ? 'Admin' : 'Employee');
        const confirmMsg = `Are you sure you want to change ${selectedUser.name}'s role to ${roleName}?`;

        if (!window.confirm(confirmMsg)) return;

        const res = await api.updateUserRole(selectedUser.id, newRole);
        if (res.success) {
            alert(`User role updated to ${roleName} successfully!`);
            // Update local state
            const updatedUser = { ...selectedUser, role: newRole };
            setSelectedUser(updatedUser);
            setUsers(users.map(u => u.id === selectedUser.id ? updatedUser : u));
        } else {
            alert("Failed to update role: " + res.message);
        }
    }

    const handleUpdateSeniorStatus = async (isSenior) => {
        if (!selectedUser) return;
        const res = await api.updateUserSeniorStatus(selectedUser.id, isSenior);
        if (res.success) {
            alert(`User ${isSenior ? 'promoted to Senior' : 'removed from Senior role'}`);
            const updatedUser = { ...selectedUser, isSenior: isSenior };
            setSelectedUser(updatedUser);
            setUsers(users.map(u => u.id === selectedUser.id ? updatedUser : u));
        } else {
            alert("Failed to update senior status: " + res.message);
        }
    }

    const handleAssignSenior = async (seniorId) => {
        if (!selectedUser) return;
        const res = await api.assignSenior(selectedUser.id, seniorId);
        if (res.success) {
            // alert("Senior assigned successfully"); // Optional to alert, or just update UI
            const updatedUser = { ...selectedUser, assignedSeniorId: seniorId };
            setSelectedUser(updatedUser);
            setUsers(users.map(u => u.id === selectedUser.id ? updatedUser : u));
        } else {
            alert("Failed to assign senior: " + res.message);
        }
    }

    return (
        <div className="flex flex-col h-full gap-6 animate-in fade-in duration-500">
            {/* Top Bar: Cutoff Management */}
            <div className="bg-[#141419] rounded-3xl border border-[#1f1f23] p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-[#8b5cf6]/10 rounded-xl text-[#8b5cf6]">
                        <UserIcon size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white">Admin Dashboard</h2>
                        <p className="text-xs text-slate-500">Manage cutoffs and employee submissions</p>
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
                                const selectedId = e.target.value;
                                setCutoff(cutoffs.find(c => c.id === selectedId) || null);
                            }}
                        >
                            <option value="" style={{ backgroundColor: '#1f1f23', color: '#fff' }}>Select Cutoff Period</option>
                            {cutoffs.map(cutoff => (
                                <option key={cutoff.id} value={cutoff.id} style={{ backgroundColor: '#1f1f23', color: '#fff' }}>
                                    {`${new Date(cutoff.startDate.toDate()).toLocaleDateString('en-GB')} - ${new Date(cutoff.endDate.toDate()).toLocaleDateString('en-GB')}`}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="h-8 w-[1px] bg-slate-700"></div>
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            className="bg-[#141419] text-white text-xs px-2 py-1.5 rounded border border-slate-700 focus:outline-none focus:border-[#8b5cf6]"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                        <span className="text-slate-500 text-xs">to</span>
                        <input
                            type="date"
                            className="bg-[#141419] text-white text-xs px-2 py-1.5 rounded border border-slate-700 focus:outline-none focus:border-[#8b5cf6]"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                        <button
                            onClick={handleSetCutoff}
                            className="px-3 py-1.5 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-xs font-bold rounded-lg transition-colors"
                        >
                            Set New
                        </button>
                    </div>
                </div>
            </div>

            {/* View Switcher: only super admins can see the Cutoffs folder view */}
            {isSuperAdmin && (
                <div className="flex items-center gap-2 bg-[#141419] rounded-2xl border border-[#1f1f23] p-1.5 w-fit">
                    <button
                        onClick={() => setView('employees')}
                        className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-colors
                            ${view === 'employees' ? 'bg-[#8b5cf6] text-white' : 'text-slate-500 hover:text-white'}`}
                    >
                        <Users size={14} />
                        Employees
                    </button>
                    <button
                        onClick={() => setView('cutoffs')}
                        className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-colors
                            ${view === 'cutoffs' ? 'bg-[#8b5cf6] text-white' : 'text-slate-500 hover:text-white'}`}
                    >
                        <Folder size={14} />
                        Cutoffs
                    </button>
                </div>
            )}

            {view === 'cutoffs' && isSuperAdmin ? (
                <CutoffsView />
            ) : (
            <div className="flex flex-1 gap-6 overflow-hidden">
                {/* User List Panel */}
                <div className="w-80 flex flex-col gap-4">
                    <div className="bg-[#141419] rounded-3xl border border-[#1f1f23] overflow-hidden flex flex-col h-full">
                        <div className="p-6 border-b border-[#1f1f23]">
                            <h2 className="text-xl font-bold text-white mb-4">Employees</h2>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 h-4 w-4" />
                                <input
                                    type="text"
                                    placeholder="Search users..."
                                    className="w-full bg-[#1f1f23] text-white text-sm rounded-xl py-2 pl-9 pr-4 focus:outline-none focus:ring-1 focus:ring-[#8b5cf6]"
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
                                <div className="text-center py-8 text-slate-500 text-sm">No users found</div>
                            ) : (
                                filteredUsers.map(user => {
                                    const submission = getSubmissionStatus(user.id)
                                    const isSubmitted = !!submission && submission.status !== 'rejected'
                                    const isApproved = submission?.status === 'approved'
                                    const badgeColor = isApproved ? 'bg-[#22c55e]/20 text-[#22c55e] border-[#22c55e]/20' : 'bg-amber-500/20 text-amber-500 border-amber-500/20'

                                    return (
                                        <button
                                            key={user.id}
                                            onClick={() => setSelectedUser(user)}
                                            className={`w-full text-left p-3 rounded-xl transition-all flex items-center gap-3 relative overflow-hidden group
                                                ${selectedUser?.id === user.id
                                                    ? 'bg-[#8b5cf6] text-white shadow-lg shadow-purple-900/20'
                                                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                                }`}
                                        >
                                            {/* Status Indicator Bar */}
                                            {isSubmitted && (
                                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${isApproved ? 'bg-[#22c55e]' : 'bg-amber-500'}`} />
                                            )}

                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0
                                                ${selectedUser?.id === user.id ? 'bg-white text-[#8b5cf6]' : 'bg-[#1f1f23] text-slate-500'}`}>
                                                {user.name?.charAt(0) || '?'}
                                            </div>

                                            <div className="overflow-hidden flex-1 flex flex-col justify-center">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-bold truncate max-w-[120px]">{user.name || 'Unknown'}</p>
                                                    {isSubmitted && (
                                                        <div className="flex gap-1">
                                                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0 border ${badgeColor}`}>
                                                                SENT
                                                            </span>
                                                            {submission.otStatus === 'approved' && (
                                                                <span className="text-[9px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded font-bold uppercase shrink-0 border border-amber-500/20">
                                                                    APPROVED
                                                                </span>
                                                            )}
                                                            {submission.otStatus === 'declined' && (
                                                                <span className="text-[9px] bg-red-500/20 text-red-500 px-1.5 py-0.5 rounded font-bold uppercase shrink-0 border border-red-500/20">
                                                                    DECLINED
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <p className={`text-xs truncate ${selectedUser?.id === user.id ? 'text-purple-200' : 'text-slate-600'}`}>
                                                    {user.email}
                                                </p>
                                            </div>

                                            {user.role === 'admin' && (
                                                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ml-auto flex-shrink-0
                                                    ${selectedUser?.id === user.id ? 'bg-white/20 text-white' : 'bg-red-500/10 text-red-500'}`}>
                                                    ADM
                                                </span>
                                            )}
                                            {user.role === 'super_admin' && (
                                                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ml-auto flex-shrink-0
                                                    ${selectedUser?.id === user.id ? 'bg-white/20 text-white' : 'bg-purple-500/10 text-purple-500'}`}>
                                                    S.ADM
                                                </span>
                                            )}
                                            {user.isSenior && (
                                                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ml-1 flex-shrink-0
                                                    ${selectedUser?.id === user.id ? 'bg-amber-500/20 text-white' : 'bg-amber-500/10 text-amber-500'}`}>
                                                    SNR
                                                </span>
                                            )}
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
                                        {selectedUser.role === 'admin' && (
                                            <span className="text-xs bg-red-500/10 text-red-500 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                                                Administrator
                                            </span>
                                        )}
                                        {selectedUser.role === 'super_admin' && (
                                            <span className="text-xs bg-purple-500/10 text-purple-500 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                                                Super Admin
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-4">
                                        <button
                                            onClick={handleExportDTR}
                                            className="flex items-center gap-2 px-4 py-2 bg-[#22c55e] hover:bg-[#16a34a] text-black text-xs font-bold rounded-xl transition-colors shadow-lg shadow-green-900/20"
                                        >
                                            <FileSpreadsheet size={16} />
                                            Export DTR to Excel
                                        </button>

                                        {/* Role Management Buttons */}
                                        {currentUser.id !== selectedUser.id && ( 
                                            <>
                                                {selectedUser.role === 'employee' && (
                                                    <button
                                                        onClick={() => handleUpdateRole('admin')}
                                                        className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 text-xs font-bold rounded-xl transition-colors"
                                                    >
                                                        Promote to Admin
                                                    </button>
                                                )}
                                                {selectedUser.role === 'admin' && (
                                                    <>
                                                        {currentUser.role === 'super_admin' && (
                                                            <button
                                                                onClick={() => handleUpdateRole('super_admin')}
                                                                className="flex items-center gap-2 px-4 py-2 bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 border border-purple-500/20 text-xs font-bold rounded-xl transition-colors"
                                                            >
                                                                Promote to Super Admin
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleUpdateRole('employee')}
                                                            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 text-xs font-bold rounded-xl transition-colors"
                                                        >
                                                            Demote to Employee
                                                        </button>
                                                    </>
                                                )}
                                                {selectedUser.role === 'super_admin' && (
                                                    <button
                                                        onClick={() => handleUpdateRole('admin')}
                                                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 text-xs font-bold rounded-xl transition-colors"
                                                    >
                                                        Demote to Admin
                                                    </button>
                                                )}
                                                {/* Senior Role Toggle */}
                                                <button
                                                    onClick={() => handleUpdateSeniorStatus(!selectedUser.isSenior)}
                                                    className={`flex items-center gap-2 px-4 py-2 border text-xs font-bold rounded-xl transition-colors
                                                        ${selectedUser.isSenior
                                                            ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20'
                                                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'}`}
                                                >
                                                    {selectedUser.isSenior ? 'Remove Senior Role' : 'Make Senior'}
                                                </button>
                                            </>
                                        )}
                                    </div>

                                    {/* Senior Assignment */}
                                    <div className="mt-4 p-4 bg-[#1f1f23] rounded-xl border border-slate-800">
                                        <label className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-2">Assigned Senior</label>
                                        <select
                                            className="w-full bg-[#141419] text-white text-sm px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-amber-500"
                                            value={selectedUser.assignedSeniorId || ''}
                                            onChange={(e) => handleAssignSenior(e.target.value)}
                                        >
                                            <option value="">-- No Senior Assigned --</option>
                                            {users.filter(u => u.isSenior && u.id !== selectedUser.id).map(senior => (
                                                <option key={senior.id} value={senior.id}>
                                                    {senior.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Attachment Viewer */}
                                {getSubmissionStatus(selectedUser.id) ? (
                                    <div className="flex flex-col items-end gap-2">
                                        <div className="flex flex-col md:flex-row items-end md:items-center justify-between w-full gap-4 mb-2">
                                            {/* Actions for Super Admin */}
                                            {currentUser.role === 'super_admin' && !selectedUser.assignedSeniorId && ['pending', 'pending_senior'].includes(getSubmissionStatus(selectedUser.id).status) ? (
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleDTRAction('approved')} className="px-4 py-2 bg-[#22c55e] hover:bg-[#16a34a] text-black text-xs font-bold uppercase tracking-wider rounded-xl transition-colors shadow-lg shadow-green-900/20">
                                                        Approve DTR
                                                    </button>
                                                    <button onClick={() => handleDTRAction('rejected')} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors shadow-lg shadow-red-900/20">
                                                        Reject
                                                    </button>
                                                </div>
                                            ) : <div></div>}
                                            
                                            <p className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1
                                                ${getSubmissionStatus(selectedUser.id).status === 'approved' ? 'text-[#22c55e]' : 
                                                  getSubmissionStatus(selectedUser.id).status === 'rejected' ? 'text-red-500' : 'text-amber-500'}`}>
                                                <span className={`w-2 h-2 rounded-full 
                                                    ${getSubmissionStatus(selectedUser.id).status === 'approved' ? 'bg-[#22c55e]' : 
                                                      getSubmissionStatus(selectedUser.id).status === 'rejected' ? 'bg-red-500' : 'bg-amber-500'}`}></span>
                                                DTR {getSubmissionStatus(selectedUser.id).status.toUpperCase().replace('PENDING_SENIOR', 'PENDING')}
                                            </p>
                                        </div>

                                        {/* URLs */}
                                        {(() => {
                                            const sub = getSubmissionStatus(selectedUser.id);
                                            if (sub.links && sub.links.length > 0) {
                                                return (
                                                    <div className="flex flex-col gap-1 items-end w-full max-w-sm mb-2">
                                                        {sub.links.map((link, idx) => (
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
                                                )
                                            }
                                            return null;
                                        })()}

                                        {/* Image Attachments */}
                                        <div className="flex flex-wrap gap-2 justify-end max-w-sm">
                                            {(() => {
                                                const sub = getSubmissionStatus(selectedUser.id);
                                                // Handle both new array format and old string format
                                                const attachments = sub.attachments || (sub.attachmentUrl ? [sub.attachmentUrl] : []);

                                                return attachments.map((url, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => {
                                                            const link = document.createElement('a');
                                                            link.href = url;
                                                            link.download = `DTR_${selectedUser.name}_${idx + 1}_${new Date().toISOString().split('T')[0]}.png`;
                                                            document.body.appendChild(link);
                                                            link.click();
                                                            document.body.removeChild(link);
                                                        }}
                                                        className="group relative block w-24 h-24 bg-[#1f1f23] rounded-lg border border-slate-700 overflow-hidden hover:border-[#22c55e] hover:ring-2 hover:ring-[#22c55e]/20 transition-all cursor-pointer"
                                                        title={`Click to Download Image ${idx + 1}`}
                                                    >
                                                        {/* Preview Image */}
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
                                                ))
                                            })()}
                                        </div>

                                        {/* Attachment Comments */}
                                        {(() => {
                                            const sub = getSubmissionStatus(selectedUser.id);
                                            // Handle new array format
                                            if (sub.attachmentComments && sub.attachmentComments.length > 0) {
                                                return (
                                                    <div className="mt-3 space-y-2 max-w-sm">
                                                        <p className="text-[10px] text-[#8b5cf6] font-bold uppercase tracking-wider flex items-center gap-1">
                                                            <span>💬</span> Attachment Comments ({sub.attachmentComments.length})
                                                        </p>
                                                        {sub.attachmentComments.map((item, idx) => (
                                                            <div key={idx} className="p-2.5 bg-[#1f1f23] rounded-lg border border-slate-700">
                                                                <p className="text-[10px] text-slate-500 mb-1">{item.fileCount} file(s)</p>
                                                                <p className="text-xs text-slate-300 leading-relaxed">{item.comment}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )
                                            }
                                            // Handle legacy single comment format
                                            if (sub.attachmentComment) {
                                                return (
                                                    <div className="mt-3 p-3 bg-[#1f1f23] rounded-lg border border-slate-700 max-w-sm">
                                                        <p className="text-[10px] text-[#8b5cf6] font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                                                            <span>💬</span> Attachment Comment
                                                        </p>
                                                        <p className="text-xs text-slate-300 leading-relaxed">{sub.attachmentComment}</p>
                                                    </div>
                                                )
                                            }
                                            return null;
                                        })()}

                                        <p className="text-[10px] text-slate-500 mt-1">
                                            {new Date(getSubmissionStatus(selectedUser.id).submittedAt.toDate()).toLocaleString()}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="px-4 py-2 rounded-xl bg-[#1f1f23] border border-[#1f1f23] text-slate-500 text-xs font-bold uppercase">
                                        No Submission Yet
                                    </div>
                                )}
                            </div>

                            {/* DTR Table */}
                            {loadingHistory ? (
                                <div className="flex items-center justify-center p-12 bg-[#141419] rounded-3xl border border-[#1f1f23]">
                                    <Loader2 className="animate-spin text-[#8b5cf6]" size={32} />
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <DTRTable
                                        user={selectedUser} // Pass selected user so table saves to THEIR log
                                        history={userHistory}
                                        onRefresh={() => loadHistory(selectedUser.id)}
                                        initialDate={cutoff ? cutoff.startDate.toDate() : null}
                                        periodEnd={cutoff ? cutoff.endDate.toDate() : null}
                                    />
                                    <RecentActivityTable history={userHistory} />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center bg-[#141419] rounded-3xl border border-[#1f1f23] text-slate-500">
                            <UserIcon size={48} className="mb-4 opacity-20" />
                            <p className="text-lg font-medium">Select an employee to view their records</p>
                        </div>
                    )}
                </div>
            </div>
            )}
        </div>
    )
}
