import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderOpen, Loader2, Search, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'
import { api } from '../services/api'
import DTRTable from './DTRTable'

export default function CutoffsView() {
    const [cutoffs, setCutoffs] = useState([])
    const [activeCutoff, setActiveCutoff] = useState(null)
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [expanded, setExpanded] = useState(new Set())
    const [historyByUser, setHistoryByUser] = useState({})
    const [loadingUserIds, setLoadingUserIds] = useState(new Set())
    const [submissionsByCutoff, setSubmissionsByCutoff] = useState({})

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        setLoading(true)
        const [allCutoffs, active, allUsers] = await Promise.all([
            api.getAllCutoffs(),
            api.getActiveCutoff(),
            api.getAllUsers()
        ])
        setCutoffs(allCutoffs)
        setActiveCutoff(active)
        setUsers(allUsers)
        setLoading(false)
    }

    const filteredUsers = users
        .filter(u =>
            u.name?.toLowerCase().includes(search.toLowerCase()) ||
            u.email?.toLowerCase().includes(search.toLowerCase())
        )
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

    const ensureHistoriesLoaded = async (userList) => {
        const missing = userList.filter(u => !(u.id in historyByUser) && !loadingUserIds.has(u.id))
        if (missing.length === 0) return

        setLoadingUserIds(prev => new Set([...prev, ...missing.map(u => u.id)]))
        const results = await Promise.all(missing.map(u => api.getHistory(u.id)))
        setHistoryByUser(prev => {
            const next = { ...prev }
            missing.forEach((u, i) => { next[u.id] = results[i] })
            return next
        })
        setLoadingUserIds(prev => {
            const next = new Set(prev)
            missing.forEach(u => next.delete(u.id))
            return next
        })
    }

    const ensureSubmissionsLoaded = async (cutoffId) => {
        if (submissionsByCutoff[cutoffId]) return
        const subs = await api.getSubmissionsForCutoff(cutoffId)
        const map = {}
        subs.forEach(s => { map[s.userId] = s })
        setSubmissionsByCutoff(prev => ({ ...prev, [cutoffId]: map }))
    }

    const toggleFolder = (cutoff) => {
        const isCurrentlyExpanded = expanded.has(cutoff.id)
        setExpanded(prev => {
            const next = new Set(prev)
            if (isCurrentlyExpanded) next.delete(cutoff.id)
            else next.add(cutoff.id)
            return next
        })
        if (!isCurrentlyExpanded) {
            ensureHistoriesLoaded(filteredUsers)
            ensureSubmissionsLoaded(cutoff.id)
        }
    }

    const refreshUserHistory = async (userId) => {
        const data = await api.getHistory(userId)
        setHistoryByUser(prev => ({ ...prev, [userId]: data }))
    }

    const formatCutoffLabel = (cutoff) => {
        const opts = { month: 'long', day: 'numeric', year: 'numeric' }
        const start = cutoff.startDate.toDate().toLocaleDateString('en-US', opts)
        const end = cutoff.endDate.toDate().toLocaleDateString('en-US', opts)
        return `${start} – ${end}`
    }

    const handleExport = (user, history, cutoff) => {
        const start = cutoff.startDate.toDate()
        const end = cutoff.endDate.toDate()

        const dates = []
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            dates.push(new Date(d))
        }

        const exportData = dates.map(date => {
            const dateStr = date.toLocaleDateString('en-GB')
            const dayStr = date.toLocaleDateString('en-GB', { weekday: 'long' })

            const findLog = (type) => history.find(h =>
                new Date(h.timestamp).toDateString() === date.toDateString() &&
                h.type === type
            )
            const findAnyLog = () => history.find(h =>
                h.type !== 'EDIT' && new Date(h.timestamp).toDateString() === date.toDateString()
            )
            const formatTime = (log) => log ? new Date(log.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }) : ''

            return {
                Date: dateStr,
                Day: dayStr,
                "Time In": formatTime(findLog('IN')),
                "Time Out": formatTime(findLog('OUT')),
                "OT In": formatTime(findLog('OT_IN')),
                "OT Out": formatTime(findLog('OT_OUT')),
                "Notes": findAnyLog()?.reason || ''
            }
        })

        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.json_to_sheet(exportData)
        ws['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 30 }]
        XLSX.utils.book_append_sheet(wb, ws, "DTR Record")

        const fileName = `DTR_${user.name.replace(/\s+/g, '_')}_${start.toISOString().split('T')[0]}_to_${end.toISOString().split('T')[0]}.xlsx`
        XLSX.writeFile(wb, fileName)
    }

    const sortedCutoffs = [...cutoffs].sort((a, b) => b.startDate.toDate() - a.startDate.toDate())

    return (
        <div className="flex flex-col h-full gap-6 animate-in fade-in duration-500">
            <div className="bg-[#141419] rounded-3xl border border-[#1f1f23] p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-[#8b5cf6]/10 rounded-xl text-[#8b5cf6]">
                        <Folder size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white">Cutoffs</h2>
                        <p className="text-xs text-slate-500">Browse every employee's DTR grouped by cutoff period</p>
                    </div>
                </div>

                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 h-4 w-4" />
                    <input
                        type="text"
                        placeholder="Filter employees..."
                        className="w-full bg-[#1f1f23] text-white text-sm rounded-xl py-2 pl-9 pr-4 focus:outline-none focus:ring-1 focus:ring-[#8b5cf6]"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {loading ? (
                    <div className="flex justify-center py-12 text-slate-500">
                        <Loader2 className="animate-spin" size={28} />
                    </div>
                ) : sortedCutoffs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center bg-[#141419] rounded-3xl border border-[#1f1f23] text-slate-500 py-16">
                        <Folder size={48} className="mb-4 opacity-20" />
                        <p className="text-lg font-medium">No cutoff periods found</p>
                        <p className="text-sm text-slate-600 mt-1">Create one from the Admin Dashboard</p>
                    </div>
                ) : (
                    sortedCutoffs.map(cutoff => {
                        const isOpen = expanded.has(cutoff.id)
                        const isCurrent = activeCutoff?.id === cutoff.id
                        const cutoffSubs = submissionsByCutoff[cutoff.id] || {}

                        return (
                            <div key={cutoff.id} className="bg-[#141419] rounded-3xl border border-[#1f1f23] overflow-hidden">
                                <button
                                    onClick={() => toggleFolder(cutoff)}
                                    className="w-full flex items-center justify-between gap-4 p-5 hover:bg-white/5 transition-colors text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        {isOpen ? <FolderOpen size={20} className="text-[#8b5cf6]" /> : <Folder size={20} className="text-slate-500" />}
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-sm font-bold text-white">{formatCutoffLabel(cutoff)}</h3>
                                                {isCurrent && (
                                                    <span className="text-[9px] bg-[#8b5cf6]/20 text-[#8b5cf6] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border border-[#8b5cf6]/20">
                                                        Current
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500 mt-0.5">{filteredUsers.length} employee{filteredUsers.length !== 1 ? 's' : ''}</p>
                                        </div>
                                    </div>
                                    {isOpen ? <ChevronDown size={18} className="text-slate-500" /> : <ChevronRight size={18} className="text-slate-500" />}
                                </button>

                                {isOpen && (
                                    <div className="border-t border-[#1f1f23] p-5 space-y-8">
                                        {filteredUsers.length === 0 ? (
                                            <p className="text-sm text-slate-500 text-center py-6">No employees found</p>
                                        ) : (
                                            filteredUsers.map(user => {
                                                const history = historyByUser[user.id]
                                                const isLoadingHistory = loadingUserIds.has(user.id)
                                                const submission = cutoffSubs[user.id]

                                                return (
                                                    <div key={user.id} className="space-y-3">
                                                        <div className="flex items-center justify-between gap-4 flex-wrap">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-full bg-[#1f1f23] text-slate-500 flex items-center justify-center font-bold text-xs flex-shrink-0">
                                                                    {user.name?.charAt(0) || '?'}
                                                                </div>
                                                                <div>
                                                                    <p className="text-sm font-bold text-white">{user.name || 'Unknown'}</p>
                                                                    <p className="text-xs text-slate-500">{user.email}</p>
                                                                </div>
                                                                {submission && (
                                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase border
                                                                        ${submission.status === 'approved' ? 'bg-[#22c55e]/20 text-[#22c55e] border-[#22c55e]/20' :
                                                                          submission.status === 'rejected' ? 'bg-red-500/20 text-red-500 border-red-500/20' :
                                                                          'bg-amber-500/20 text-amber-500 border-amber-500/20'}`}>
                                                                        {submission.status.toUpperCase().replace('PENDING_SENIOR', 'PENDING')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <button
                                                                onClick={() => handleExport(user, history || [], cutoff)}
                                                                disabled={isLoadingHistory}
                                                                className="flex items-center gap-2 px-3 py-1.5 bg-[#22c55e] hover:bg-[#16a34a] text-black text-xs font-bold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                            >
                                                                <FileSpreadsheet size={14} />
                                                                Export
                                                            </button>
                                                        </div>

                                                        {isLoadingHistory ? (
                                                            <div className="flex items-center justify-center p-8 bg-[#1a1a22] rounded-2xl border border-[#1f1f23]">
                                                                <Loader2 className="animate-spin text-[#8b5cf6]" size={20} />
                                                            </div>
                                                        ) : (
                                                            <DTRTable
                                                                user={user}
                                                                history={history || []}
                                                                onRefresh={() => refreshUserHistory(user.id)}
                                                                initialDate={cutoff.startDate.toDate()}
                                                                periodEnd={cutoff.endDate.toDate()}
                                                            />
                                                        )}
                                                    </div>
                                                )
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}
