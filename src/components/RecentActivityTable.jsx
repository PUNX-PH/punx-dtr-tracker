import { useState } from 'react'
import { CheckCircle2, Pencil, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eye, X } from 'lucide-react'

// Windowed page numbers around `current` (e.g. 7 8 [9] 10 11), so the control
// stays a fixed width regardless of how many pages of history exist.
const getPageWindow = (current, total, windowSize = 5) => {
    let start = Math.max(1, current - Math.floor(windowSize / 2))
    let end = Math.min(total, start + windowSize - 1)
    start = Math.max(1, end - windowSize + 1)
    const pages = []
    for (let p = start; p <= end; p++) pages.push(p)
    return pages
}

export default function RecentActivityTable({ history }) {
    const [activityPage, setActivityPage] = useState(1)
    const [selectedEditLog, setSelectedEditLog] = useState(null)
    const ITEMS_PER_PAGE = 10

    return (
        <>
            <div className="bg-[var(--surface-1)] rounded-3xl border border-[var(--border)] overflow-hidden">
                <div className="p-6 border-b border-[var(--border)] flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-[var(--text-primary)]">Recent Activity</h3>
                        <p className="text-xs text-[var(--text-muted)]">Latest logs — Page {activityPage} of {Math.max(1, Math.ceil(history.length / ITEMS_PER_PAGE))}</p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Type</th>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Time</th>
                                <th className="px-6 py-4">Notes</th>
                                <th className="px-6 py-4 text-right">Source</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {history.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-[var(--text-muted)]">
                                        No activity found.
                                    </td>
                                </tr>
                            ) : (
                                history.slice((activityPage - 1) * ITEMS_PER_PAGE, activityPage * ITEMS_PER_PAGE).map((log) => {
                                    const typeConfig = {
                                        'IN':     { label: 'TIME IN',  color: 'var(--accent-green)', dot: 'bg-[var(--accent-green)]' },
                                        'OUT':    { label: 'TIME OUT', color: 'var(--accent-red)', dot: 'bg-[var(--accent-red)]' },
                                        'OT_IN':  { label: 'OT IN',   color: 'var(--accent-purple)', dot: 'bg-[var(--accent-purple)]' },
                                        'OT_OUT': { label: 'OT OUT',  color: 'var(--accent-purple)', dot: 'bg-[var(--accent-purple)]' },
                                        'EDIT':   { label: 'EDITED',   color: 'var(--accent-amber)', dot: 'bg-[var(--accent-amber)]' },
                                    }
                                    const config = typeConfig[log.type] || { label: log.type, color: 'var(--text-muted)', dot: 'bg-[var(--text-muted)]' }
                                    // Split OT: label the session number when it's not the first one
                                    const sessionSuffix = (log.type === 'OT_IN' || log.type === 'OT_OUT') && log.session ? ` #${log.session + 1}` : ''
                                    const isManual = !!log.reason || log.type === 'OT_IN' || log.type === 'OT_OUT'
                                    const isEditLog = log.type === 'EDIT'

                                    return (
                                        <tr key={log.id} className={`hover:bg-white/5 transition-colors ${isEditLog ? 'cursor-pointer hover:bg-[var(--accent-amber)]/5' : ''}`} onClick={() => isEditLog && setSelectedEditLog(log)}>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-2 h-2 rounded-full ${config.dot}`} />
                                                    <span className="font-bold text-sm" style={{ color: config.color }}>{config.label}{sessionSuffix}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-[var(--text-secondary)] font-medium">
                                                {new Date(log.timestamp).toLocaleDateString('en-GB')}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-[var(--text-secondary)] font-mono">
                                                {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="px-6 py-4 text-xs text-[var(--text-secondary)] max-w-[200px]">
                                                {log.reason ? (
                                                    <span className="text-[var(--text-primary)] truncate block" title={log.reason}>{log.reason}</span>
                                                ) : (
                                                    <span className="text-[var(--text-muted)]">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {isEditLog ? (
                                                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] text-[10px] font-bold uppercase tracking-wider group/badge">
                                                        <Eye size={10} />
                                                        View Details
                                                    </div>
                                                ) : isManual ? (
                                                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] text-[10px] font-bold uppercase tracking-wider">
                                                        <Pencil size={10} />
                                                        Manual Edit
                                                    </div>
                                                ) : (
                                                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--accent-green)]/10 text-[var(--accent-green)] text-[10px] font-bold uppercase tracking-wider">
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
                {history.length > ITEMS_PER_PAGE && (() => {
                    const totalPages = Math.ceil(history.length / ITEMS_PER_PAGE)
                    const isFirst = activityPage === 1
                    const isLast = activityPage >= totalPages
                    const navBtn = "flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold transition-all"
                    const navBtnState = (disabled) => disabled
                        ? 'bg-[var(--surface-3)] text-[var(--text-muted)] cursor-not-allowed'
                        : 'bg-[var(--surface-3)] text-[var(--text-primary)] hover:bg-[var(--surface-3-hover)] border border-[var(--border-strong)] hover:border-[var(--accent-purple)]'

                    return (
                        <div className="p-4 border-t border-[var(--border)] flex items-center justify-between">
                            <p className="text-xs text-[var(--text-muted)]">
                                Showing {((activityPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(activityPage * ITEMS_PER_PAGE, history.length)} of {history.length} entries
                            </p>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setActivityPage(1)}
                                    disabled={isFirst}
                                    title="First page"
                                    className={`${navBtn} ${navBtnState(isFirst)}`}
                                >
                                    <ChevronsLeft size={14} />
                                </button>
                                <button
                                    onClick={() => setActivityPage(p => Math.max(1, p - 1))}
                                    disabled={isFirst}
                                    title="Previous page"
                                    className={`${navBtn} ${navBtnState(isFirst)}`}
                                >
                                    <ChevronLeft size={14} />
                                </button>

                                {/* Windowed page number indicators (fixed-width, doesn't grow with page count) */}
                                <div className="flex items-center gap-1 mx-1">
                                    {getPageWindow(activityPage, totalPages).map(page => (
                                        <button
                                            key={page}
                                            onClick={() => setActivityPage(page)}
                                            className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                                                page === activityPage
                                                    ? 'bg-[var(--accent-purple)] text-white shadow-lg shadow-purple-900/30'
                                                    : 'bg-[var(--surface-3)] text-[var(--text-secondary)] hover:bg-[var(--surface-3-hover)] hover:text-[var(--text-primary)]'
                                            }`}
                                        >
                                            {page}
                                        </button>
                                    ))}
                                </div>

                                <button
                                    onClick={() => setActivityPage(p => Math.min(totalPages, p + 1))}
                                    disabled={isLast}
                                    title="Next page"
                                    className={`${navBtn} ${navBtnState(isLast)}`}
                                >
                                    <ChevronRight size={14} />
                                </button>
                                <button
                                    onClick={() => setActivityPage(totalPages)}
                                    disabled={isLast}
                                    title="Last page"
                                    className={`${navBtn} ${navBtnState(isLast)}`}
                                >
                                    <ChevronsRight size={14} />
                                </button>
                            </div>
                        </div>
                    )
                })()}
            </div>

            {/* Edit Detail Modal */}
            {selectedEditLog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedEditLog(null)}>
                    <div className="bg-[var(--surface-1)] border border-[var(--accent-amber)]/30 rounded-2xl shadow-2xl shadow-amber-900/20 w-full max-w-lg mx-4 animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-[var(--accent-amber)]/10 rounded-xl">
                                    <Pencil size={18} className="text-[var(--accent-amber)]" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-[var(--text-primary)]">Edit Details</h3>
                                    <p className="text-xs text-[var(--text-muted)]">
                                        {new Date(selectedEditLog.timestamp).toLocaleDateString('en-GB')} at {new Date(selectedEditLog.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedEditLog(null)}
                                className="p-2 hover:bg-white/10 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
                            {selectedEditLog.editDetails && selectedEditLog.editDetails.length > 0 ? (
                                selectedEditLog.editDetails.map((detail, i) => (
                                    <div key={i} className="p-4 bg-[var(--surface-2)] rounded-xl border border-[var(--border)] hover:border-[var(--accent-amber)]/20 transition-colors">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-amber)]" />
                                            <span className="text-sm font-bold text-[var(--text-primary)]">{detail.date}</span>
                                        </div>
                                        <div className="pl-4 space-y-1">
                                            {detail.changes.split(', ').map((change, j) => (
                                                <div key={j} className="flex items-center gap-2 text-xs">
                                                    <span className="text-[var(--text-muted)]">→</span>
                                                    <span className="text-[var(--text-secondary)]">{change}</span>
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
                                            <div key={i} className="p-4 bg-[var(--surface-2)] rounded-xl border border-[var(--border)]">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-amber)]" />
                                                    <span className="text-sm font-bold text-[var(--text-primary)]">{dateLabel}</span>
                                                </div>
                                                {changes !== 'No details' ? (
                                                    <div className="pl-4 space-y-1">
                                                        {changes.split(', ').map((change, j) => (
                                                            <div key={j} className="flex items-center gap-2 text-xs">
                                                                <span className="text-[var(--text-muted)]">→</span>
                                                                <span className="text-[var(--text-secondary)]">{change}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="pl-4 text-xs text-[var(--text-secondary)]">No further details.</div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-[var(--border)] flex justify-end">
                            <button
                                onClick={() => setSelectedEditLog(null)}
                                className="px-4 py-2 bg-[var(--surface-3)] hover:bg-[var(--surface-3-hover)] text-[var(--text-primary)] text-xs font-bold rounded-xl border border-[var(--border-strong)] hover:border-[var(--accent-amber)]/50 transition-all"
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
