import { useState } from 'react'
import { CheckCircle2, Pencil, ChevronLeft, ChevronRight, Eye, X } from 'lucide-react'

export default function RecentActivityTable({ history }) {
    const [activityPage, setActivityPage] = useState(1)
    const [selectedEditLog, setSelectedEditLog] = useState(null)
    const ITEMS_PER_PAGE = 10

    return (
        <>
            <div className="bg-[#141419] rounded-3xl border border-[#1f1f23] overflow-hidden">
                <div className="p-6 border-b border-[#1f1f23] flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-white">Recent Activity</h3>
                        <p className="text-xs text-slate-500">Latest logs — Page {activityPage} of {Math.max(1, Math.ceil(history.length / ITEMS_PER_PAGE))}</p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-[#1a1a20] text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Type</th>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Time</th>
                                <th className="px-6 py-4">Notes</th>
                                <th className="px-6 py-4 text-right">Source</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1f1f23]">
                            {history.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                                        No activity found.
                                    </td>
                                </tr>
                            ) : (
                                history.slice((activityPage - 1) * ITEMS_PER_PAGE, activityPage * ITEMS_PER_PAGE).map((log) => {
                                    const typeConfig = {
                                        'IN':     { label: 'TIME IN',  color: '#22c55e', dot: 'bg-[#22c55e]' },
                                        'OUT':    { label: 'TIME OUT', color: '#ef4444', dot: 'bg-red-500' },
                                        'OT_IN':  { label: 'OT IN',   color: '#8b5cf6', dot: 'bg-[#8b5cf6]' },
                                        'OT_OUT': { label: 'OT OUT',  color: '#a78bfa', dot: 'bg-[#a78bfa]' },
                                        'EDIT':   { label: 'EDITED',   color: '#f59e0b', dot: 'bg-[#f59e0b]' },
                                    }
                                    const config = typeConfig[log.type] || { label: log.type, color: '#64748b', dot: 'bg-slate-500' }
                                    // Split OT: label the session number when it's not the first one
                                    const sessionSuffix = (log.type === 'OT_IN' || log.type === 'OT_OUT') && log.session ? ` #${log.session + 1}` : ''
                                    const isManual = !!log.reason || log.type === 'OT_IN' || log.type === 'OT_OUT'
                                    const isEditLog = log.type === 'EDIT'

                                    return (
                                        <tr key={log.id} className={`hover:bg-white/5 transition-colors ${isEditLog ? 'cursor-pointer hover:bg-[#f59e0b]/5' : ''}`} onClick={() => isEditLog && setSelectedEditLog(log)}>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-2 h-2 rounded-full ${config.dot}`} />
                                                    <span className="font-bold text-sm" style={{ color: config.color }}>{config.label}{sessionSuffix}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-400 font-medium">
                                                {new Date(log.timestamp).toLocaleDateString('en-GB')}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-400 font-mono">
                                                {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="px-6 py-4 text-xs text-slate-400 max-w-[200px]">
                                                {log.reason ? (
                                                    <span className="text-white truncate block" title={log.reason}>{log.reason}</span>
                                                ) : (
                                                    <span className="text-slate-600">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {isEditLog ? (
                                                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#f59e0b]/10 text-[#f59e0b] text-[10px] font-bold uppercase tracking-wider group/badge">
                                                        <Eye size={10} />
                                                        View Details
                                                    </div>
                                                ) : isManual ? (
                                                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#8b5cf6]/10 text-[#8b5cf6] text-[10px] font-bold uppercase tracking-wider">
                                                        <Pencil size={10} />
                                                        Manual Edit
                                                    </div>
                                                ) : (
                                                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#22c55e]/10 text-[#22c55e] text-[10px] font-bold uppercase tracking-wider">
                                                        <CheckCircle2 size={12} />
                                                        Auto-Logged
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {history.length > ITEMS_PER_PAGE && (
                    <div className="p-4 border-t border-[#1f1f23] flex items-center justify-between">
                        <p className="text-xs text-slate-500">
                            Showing {((activityPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(activityPage * ITEMS_PER_PAGE, history.length)} of {history.length} entries
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setActivityPage(p => Math.max(1, p - 1))}
                                disabled={activityPage === 1}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    activityPage === 1
                                        ? 'bg-[#1f1f23] text-slate-600 cursor-not-allowed'
                                        : 'bg-[#1f1f23] text-white hover:bg-[#2d2d35] border border-slate-700 hover:border-[#8b5cf6]'
                                }`}
                            >
                                <ChevronLeft size={14} />
                                Previous
                            </button>

                            {/* Page Number Indicators */}
                            <div className="flex items-center gap-1">
                                {Array.from({ length: Math.ceil(history.length / ITEMS_PER_PAGE) }, (_, i) => i + 1).map(page => (
                                    <button
                                        key={page}
                                        onClick={() => setActivityPage(page)}
                                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                                            page === activityPage
                                                ? 'bg-[#8b5cf6] text-white shadow-lg shadow-purple-900/30'
                                                : 'bg-[#1f1f23] text-slate-400 hover:bg-[#2d2d35] hover:text-white'
                                        }`}
                                    >
                                        {page}
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={() => setActivityPage(p => Math.min(Math.ceil(history.length / ITEMS_PER_PAGE), p + 1))}
                                disabled={activityPage >= Math.ceil(history.length / ITEMS_PER_PAGE)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    activityPage >= Math.ceil(history.length / ITEMS_PER_PAGE)
                                        ? 'bg-[#1f1f23] text-slate-600 cursor-not-allowed'
                                        : 'bg-[#1f1f23] text-white hover:bg-[#2d2d35] border border-slate-700 hover:border-[#8b5cf6]'
                                }`}
                            >
                                Next
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Edit Detail Modal */}
            {selectedEditLog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedEditLog(null)}>
                    <div className="bg-[#141419] border border-[#f59e0b]/30 rounded-2xl shadow-2xl shadow-amber-900/20 w-full max-w-lg mx-4 animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div className="p-6 border-b border-[#1f1f23] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-[#f59e0b]/10 rounded-xl">
                                    <Pencil size={18} className="text-[#f59e0b]" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Edit Details</h3>
                                    <p className="text-xs text-slate-500">
                                        {new Date(selectedEditLog.timestamp).toLocaleDateString('en-GB')} at {new Date(selectedEditLog.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedEditLog(null)}
                                className="p-2 hover:bg-white/10 rounded-xl text-slate-500 hover:text-white transition-all"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
                            {selectedEditLog.editDetails && selectedEditLog.editDetails.length > 0 ? (
                                selectedEditLog.editDetails.map((detail, i) => (
                                    <div key={i} className="p-4 bg-[#1a1a22] rounded-xl border border-[#1f1f23] hover:border-[#f59e0b]/20 transition-colors">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                                            <span className="text-sm font-bold text-white">{detail.date}</span>
                                        </div>
                                        <div className="pl-4 space-y-1">
                                            {detail.changes.split(', ').map((change, j) => (
                                                <div key={j} className="flex items-center gap-2 text-xs">
                                                    <span className="text-slate-600">→</span>
                                                    <span className="text-slate-300">{change}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                /* Fallback: parse from reason string for older logs */
                                <div className="space-y-3">
                                    {(selectedEditLog.reason || 'No details available.').split(' | ').map((part, i) => {
                                        const [dateLabel, ...rest] = part.split(': ');
                                        const changes = rest.join(': ') || 'No details';
                                        
                                        return (
                                            <div key={i} className="p-4 bg-[#1a1a22] rounded-xl border border-[#1f1f23]">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                                                    <span className="text-sm font-bold text-white">{dateLabel}</span>
                                                </div>
                                                {changes !== 'No details' ? (
                                                    <div className="pl-4 space-y-1">
                                                        {changes.split(', ').map((change, j) => (
                                                            <div key={j} className="flex items-center gap-2 text-xs">
                                                                <span className="text-slate-600">→</span>
                                                                <span className="text-slate-300">{change}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="pl-4 text-xs text-slate-400">No further details.</div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-[#1f1f23] flex justify-end">
                            <button
                                onClick={() => setSelectedEditLog(null)}
                                className="px-4 py-2 bg-[#1f1f23] hover:bg-[#2d2d35] text-white text-xs font-bold rounded-xl border border-slate-700 hover:border-[#f59e0b]/50 transition-all"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
