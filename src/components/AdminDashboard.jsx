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
            <div className="bg-[var(--surface-1)] rounded-3xl border border-[var(--border)] p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-[var(--accent-purple)]/10 rounded-xl text-[var(--accent-purple)]">
                        <UserIcon size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-[var(--text-primary)]">Admin Dashboard</h2>
                        <p className="text-xs text-[var(--text-muted)]">Manage cutoffs and employee submissions</p>
                    </div>
                </div>

                <div className="flex items-center gap-4 bg-[var(--surface-3)] p-2 rounded-xl border border-[var(--border-strong)]">
                    <div className="px-2">
                        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-bold">Active Cutoff</p>
                        <select
                            className="text-xs text-[var(--text-primary)] font-mono bg-[var(--surface-3)] border-none focus:outline-none cursor-pointer rounded px-1 py-0.5"
                            value={cutoff ? cutoff.id : ''}
                            onChange={(e) => {
                                const selectedId = e.target.value;
                                setCutoff(cutoffs.find(c => c.id === selectedId) || null);
                            }}
                        >
                            <option value="" style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)' }}>Select Cutoff Period</option>
                            {cutoffs.map(cutoff => (
                                <option key={cutoff.id} value={cutoff.id} style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)' }}>
                                    {`${new Date(cutoff.startDate.toDate()).toLocaleDateString('en-GB')} - ${new Date(cutoff.endDate.toDate()).toLocaleDateString('en-GB')}`}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="h-8 w-[1px] bg-[var(--border-strong)]"></div>
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            className="bg-[var(--surface-1)] text-[var(--text-primary)] text-xs px-2 py-1.5 rounded border border-[var(--border-strong)] focus:outline-none focus:border-[var(--accent-purple)]"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                        <span className="text-[var(--text-muted)] text-xs">to</span>
                        <input
                            type="date"
                            className="bg-[var(--surface-1)] text-[var(--text-primary)] text-xs px-2 py-1.5 rounded border border-[var(--border-strong)] focus:outline-none focus:border-[var(--accent-purple)]"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                        <button
                            onClick={handleSetCutoff}
                            className="px-3 py-1.5 bg-[var(--accent-purple)] hover:bg-[var(--accent-purple-hover)] text-white text-xs font-bold rounded-lg transition-colors"
                        >
                            Set New
                        </button>
                    </div>
                </div>
            </div>

            {/* View Switcher: only super admins can see the Cutoffs folder view */}
            {isSuperAdmin && (
                <div className="flex items-center gap-2 bg-[var(--surface-1)] rounded-2xl border border-[var(--border)] p-1.5 w-fit">
                    <button
                        onClick={() => setView('employees')}
                        className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-colors
                            ${view === 'employees' ? 'bg-[var(--accent-purple)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                    >
                        <Users size={14} />
                        Employees
                    </button>
                    <button
                        onClick={() => setView('cutoffs')}
                        className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-colors
                            ${view === 'cutoffs' ? 'bg-[var(--accent-purple)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
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
                    <div className="bg-[var(--surface-1)] rounded-3xl border border-[var(--border)] overflow-hidden flex flex-col h-full">
                        <div className="p-6 border-b border-[var(--border)]">
                            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4">Employees</h2>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] h-4 w-4" />
                                <input
                                    type="text"
                                    placeholder="Search users..."
                                    className="w-full bg-[var(--surface-3)] text-[var(--text-primary)] text-sm rounded-xl py-2 pl-9 pr-4 focus:outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {loading ? (
                                <div className="flex justify-center py-8 text-[var(--text-muted)]">
                                    <Loader2 className="animate-spin" />
                                </div>
                            ) : filteredUsers.length === 0 ? (
                                <div className="text-center py-8 text-[var(--text-muted)] text-sm">No users found</div>
                            ) : (
                                filteredUsers.map(user => {
                                    const submission = getSubmissionStatus(user.id)
                                    const isSubmitted = !!submission && submission.status !== 'rejected'
                                    const isApproved = submission?.status === 'approved'
                                    const badgeColor = isApproved ? 'bg-[var(--accent-green)]/20 text-[var(--accent-green)] border-[var(--accent-green)]/20' : 'bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border-[var(--accent-amber)]/20'

                                    return (
                                        <button
                                            key={user.id}
                                            onClick={() => setSelectedUser(user)}
                                            className={`w-full text-left p-3 rounded-xl transition-all flex items-center gap-3 relative overflow-hidden group
                                                ${selectedUser?.id === user.id
                                                    ? 'bg-[var(--accent-purple)] text-white shadow-lg shadow-purple-900/20'
                                                    : 'text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]'
                                                }`}
                                        >
                                            {/* Status Indicator Bar */}
                                            {isSubmitted && (
                                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${isApproved ? 'bg-[var(--accent-green)]' : 'bg-[var(--accent-amber)]'}`} />
                                            )}

                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0
                                                ${selectedUser?.id === user.id ? 'bg-white text-[var(--accent-purple)]' : 'bg-[var(--surface-3)] text-[var(--text-muted)]'}`}>
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
                                                                <span className="text-[9px] bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] px-1.5 py-0.5 rounded font-bold uppercase shrink-0 border border-[var(--accent-amber)]/20">
                                                                    APPROVED
                                                                </span>
                                                            )}
                                                            {submission.otStatus === 'declined' && (
                                                                <span className="text-[9px] bg-[var(--accent-red)]/20 text-[var(--accent-red)] px-1.5 py-0.5 rounded font-bold uppercase shrink-0 border border-[var(--accent-red)]/20">
                                                                    DECLINED
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <p className={`text-xs truncate ${selectedUser?.id === user.id ? 'text-purple-200' : 'text-[var(--text-muted)]'}`}>
                                                    {user.email}
                                                </p>
                                            </div>

                                            {user.role === 'admin' && (
                                                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ml-auto flex-shrink-0
                                                    ${selectedUser?.id === user.id ? 'bg-white/20 text-white' : 'bg-[var(--accent-red)]/10 text-[var(--accent-red)]'}`}>
                                                    ADM
                                                </span>
                                            )}
                                            {user.role === 'super_admin' && (
                                                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ml-auto flex-shrink-0
                                                    ${selectedUser?.id === user.id ? 'bg-white/20 text-white' : 'bg-[var(--accent-purple)]/10 text-[var(--accent-purple)]'}`}>
                                                    S.ADM
                                                </span>
                                            )}
                                            {user.isSenior && (
                                                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ml-1 flex-shrink-0
                                                    ${selectedUser?.id === user.id ? 'bg-amber-500/20 text-white' : 'bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]'}`}>
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
                                    <h2 className="text-3xl font-bold text-[var(--text-primary)] max-w-2xl truncate">{selectedUser.name}</h2>
                                    <div className="flex items-center gap-3 text-[var(--text-muted)] mt-1">
                                        <span className="text-sm">ID: {selectedUser.id}</span>
                                        {selectedUser.role === 'admin' && (
                                            <span className="text-xs bg-[var(--accent-red)]/10 text-[var(--accent-red)] px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                                                Administrator
                                            </span>
                                        )}
                                        {selectedUser.role === 'super_admin' && (
                                            <span className="text-xs bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                                                Super Admin
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-4">
                                        <button
                                            onClick={handleExportDTR}
                                            className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-green)] hover:bg-[var(--accent-green-hover)] text-black text-xs font-bold rounded-xl transition-colors shadow-lg shadow-green-900/20"
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
                                                        className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-red)]/10 text-[var(--accent-red)] hover:bg-[var(--accent-red)]/20 border border-[var(--accent-red)]/20 text-xs font-bold rounded-xl transition-colors"
                                                    >
                                                        Promote to Admin
                                                    </button>
                                                )}
                                                {selectedUser.role === 'admin' && (
                                                    <>
                                                        {currentUser.role === 'super_admin' && (
                                                            <button
                                                                onClick={() => handleUpdateRole('super_admin')}
                                                                className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/20 border border-[var(--accent-purple)]/20 text-xs font-bold rounded-xl transition-colors"
                                                            >
                                                                Promote to Super Admin
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleUpdateRole('employee')}
                                                            className="flex items-center gap-2 px-4 py-2 bg-[var(--surface-3)] text-[var(--text-secondary)] hover:bg-[var(--surface-3-hover)] border border-[var(--border-strong)] text-xs font-bold rounded-xl transition-colors"
                                                        >
                                                            Demote to Employee
                                                        </button>
                                                    </>
                                                )}
                                                {selectedUser.role === 'super_admin' && (
                                                    <button
                                                        onClick={() => handleUpdateRole('admin')}
                                                        className="flex items-center gap-2 px-4 py-2 bg-[var(--surface-3)] text-[var(--text-secondary)] hover:bg-[var(--surface-3-hover)] border border-[var(--border-strong)] text-xs font-bold rounded-xl transition-colors"
                                                    >
                                                        Demote to Admin
                                                    </button>
                                                )}
                                                {/* Senior Role Toggle */}
                                                <button
                                                    onClick={() => handleUpdateSeniorStatus(!selectedUser.isSenior)}
                                                    className={`flex items-center gap-2 px-4 py-2 border text-xs font-bold rounded-xl transition-colors
                                                        ${selectedUser.isSenior
                                                            ? 'bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] border-[var(--accent-amber)]/20 hover:bg-[var(--accent-amber)]/20'
                                                            : 'bg-[var(--surface-3)] text-[var(--text-secondary)] border-[var(--border-strong)] hover:text-[var(--text-primary)]'}`}
                                                >
                                                    {selectedUser.isSenior ? 'Remove Senior Role' : 'Make Senior'}
                                                </button>
                                            </>
                                        )}
                                    </div>

                                    {/* Senior Assignment */}
                                    <div className="mt-4 p-4 bg-[var(--surface-3)] rounded-xl border border-[var(--border-strong)]">
                                        <label className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider block mb-2">Assigned Senior</label>
                                        <select
                                            className="w-full bg-[var(--surface-1)] text-[var(--text-primary)] text-sm px-3 py-2 rounded-lg border border-[var(--border-strong)] focus:outline-none focus:border-[var(--accent-amber)]"
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
                                                    <button onClick={() => handleDTRAction('approved')} className="px-4 py-2 bg-[var(--accent-green)] hover:bg-[var(--accent-green-hover)] text-black text-xs font-bold uppercase tracking-wider rounded-xl transition-colors shadow-lg shadow-green-900/20">
                                                        Approve DTR
                                                    </button>
                                                    <button onClick={() => handleDTRAction('rejected')} className="px-4 py-2 bg-[var(--accent-red)] hover:bg-[var(--accent-red)] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors shadow-lg shadow-red-900/20">
                                                        Reject
                                                    </button>
                                                </div>
                                            ) : <div></div>}

                                            <p className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1
                                                ${getSubmissionStatus(selectedUser.id).status === 'approved' ? 'text-[var(--accent-green)]' :
                                                  getSubmissionStatus(selectedUser.id).status === 'rejected' ? 'text-[var(--accent-red)]' : 'text-[var(--accent-amber)]'}`}>
                                                <span className={`w-2 h-2 rounded-full
                                                    ${getSubmissionStatus(selectedUser.id).status === 'approved' ? 'bg-[var(--accent-green)]' :
                                                      getSubmissionStatus(selectedUser.id).status === 'rejected' ? 'bg-[var(--accent-red)]' : 'bg-[var(--accent-amber)]'}`}></span>
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
                                                                className="text-xs text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)] underline break-all bg-[var(--surface-2)] p-2 rounded-lg border border-[var(--accent-blue)]/20 w-fit text-right"
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
                                                        className="group relative block w-24 h-24 bg-[var(--surface-3)] rounded-lg border border-[var(--border-strong)] overflow-hidden hover:border-[var(--accent-green)] hover:ring-2 hover:ring-[var(--accent-green)]/20 transition-all cursor-pointer"
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
                                                        <p className="text-[10px] text-[var(--accent-purple)] font-bold uppercase tracking-wider flex items-center gap-1">
                                                            <span>💬</span> Attachment Comments ({sub.attachmentComments.length})
                                                        </p>
                                                        {sub.attachmentComments.map((item, idx) => (
                                                            <div key={idx} className="p-2.5 bg-[var(--surface-3)] rounded-lg border border-[var(--border-strong)]">
                                                                <p className="text-[10px] text-[var(--text-muted)] mb-1">{item.fileCount} file(s)</p>
                                                                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{item.comment}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )
                                            }
                                            // Handle legacy single comment format
                                            if (sub.attachmentComment) {
                                                return (
                                                    <div className="mt-3 p-3 bg-[var(--surface-3)] rounded-lg border border-[var(--border-strong)] max-w-sm">
                                                        <p className="text-[10px] text-[var(--accent-purple)] font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                                                            <span>💬</span> Attachment Comment
                                                        </p>
                                                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{sub.attachmentComment}</p>
                                                    </div>
                                                )
                                            }
                                            return null;
                                        })()}

                                        <p className="text-[10px] text-[var(--text-muted)] mt-1">
                                            {new Date(getSubmissionStatus(selectedUser.id).submittedAt.toDate()).toLocaleString()}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="px-4 py-2 rounded-xl bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-muted)] text-xs font-bold uppercase">
                                        No Submission Yet
                                    </div>
                                )}
                            </div>

                            {/* DTR Table */}
                            {loadingHistory ? (
                                <div className="flex items-center justify-center p-12 bg-[var(--surface-1)] rounded-3xl border border-[var(--border)]">
                                    <Loader2 className="animate-spin text-[var(--accent-purple)]" size={32} />
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
                        <div className="h-full flex flex-col items-center justify-center bg-[var(--surface-1)] rounded-3xl border border-[var(--border)] text-[var(--text-muted)]">
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
