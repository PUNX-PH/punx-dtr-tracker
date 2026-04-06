import { useState, useEffect } from 'react'
import { CheckCircle2, Clock, CheckCircle, XCircle, Send, Upload, MessageSquare, X, Save, Pencil, ChevronLeft, ChevronRight, Eye } from 'lucide-react'
import { api } from '../services/api'
import ClockComp from './Clock'
import DTRTable from './DTRTable'

export default function Dashboard({ user }) {
    const [history, setHistory] = useState([])
    const [processing, setProcessing] = useState(false)
    const [showSuccess, setShowSuccess] = useState(false)
    const [activeCutoff, setActiveCutoff] = useState(null)
    const [submission, setSubmission] = useState(null)
    const [showCutoffAlert, setShowCutoffAlert] = useState(false)
    const [files, setFiles] = useState([])
    const [uploading, setUploading] = useState(false)
    const [attachmentComment, setAttachmentComment] = useState('')
    const [showCommentBox, setShowCommentBox] = useState(false)
    const [attachmentGroups, setAttachmentGroups] = useState([]) // Array of { files: File[], comment: string }
    const [activityPage, setActivityPage] = useState(1)
    const [selectedEditLog, setSelectedEditLog] = useState(null)
    const ITEMS_PER_PAGE = 10

    // Stats for the cards (calculated from history)
    const todayLogs = history.filter(h => new Date(h.timestamp).toDateString() === new Date().toDateString());
    const hasTimeIn = todayLogs.some(l => l.type === 'IN');
    const hasTimeOut = todayLogs.some(l => l.type === 'OUT');

    useEffect(() => {
        loadHistory()
        checkCutoff()
    }, [user.id])

    const checkCutoff = async () => {
        const cutoff = await api.getActiveCutoff()
        if (cutoff) {
            setActiveCutoff(cutoff)
            // Check if submitted
            const sub = await api.getSubmission(user.id, cutoff.id)
            setSubmission(sub)
            if (!sub) {
                // Determine if we should annoy the user (active cutoff exists and not submitted)
                setShowCutoffAlert(true)
            }
        }
    }

    const loadHistory = async () => {
        const data = await api.getHistory(user.id)
        setHistory(data)
    }

    const handleLog = async (type) => {
        if (type === 'IN' && hasTimeIn) return; // Prevent double IN (simple check)
        if (type === 'OUT' && hasTimeOut) return;

        setProcessing(true)
        try {
            const result = await api.logTime(user.id, type)
            if (result.success) {
                setShowSuccess(true)
                setTimeout(() => setShowSuccess(false), 2000)
                setHistory(prev => [result.log, ...prev])
            }
        } catch (err) {
            console.error('Logging failed', err)
            alert('Failed to log time. Please check connection.')
        } finally {
            setProcessing(false)
        }
    }

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            setFiles(Array.from(e.target.files))
            setShowCommentBox(true)
            setAttachmentComment('')
        }
    }

    const handleSaveComment = () => {
        if (!attachmentComment.trim()) {
            alert('Please add a comment describing what this attachment is for.')
            return
        }
        // Add to attachment groups
        setAttachmentGroups(prev => [...prev, { files: files, comment: attachmentComment.trim() }])
        setShowCommentBox(false)
        setAttachmentComment('')
        setFiles([])
    }

    const handleCancelComment = () => {
        setShowCommentBox(false)
        setAttachmentComment('')
        setFiles([])
    }

    const handleRemoveGroup = (index) => {
        setAttachmentGroups(prev => prev.filter((_, i) => i !== index))
    }

    const handleSubmitDTR = async () => {
        if (submission) return alert("You have already submitted your DTR. Please click 'Resubmit / Update' first to make changes.")
        if (!activeCutoff) return alert("No active cutoff period")
        if (showCommentBox) {
            return alert("Please save or cancel your current attachment comment first.")
        }

        setUploading(true)
        try {
            // Convert ALL files from ALL groups to Base64
            const allBase64 = []
            const allComments = []

            for (const group of attachmentGroups) {
                const promises = group.files.map(file => {
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.readAsDataURL(file);
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = reject;
                    })
                })
                const base64Files = await Promise.all(promises)
                allBase64.push(...base64Files)
                // Store each group's comment with its file count for admin reference
                allComments.push({ comment: group.comment, fileCount: group.files.length })
            }

            const res = await api.submitDTR(user.id, activeCutoff.id, allBase64, allComments)
            if (res.success) {
                alert("DTR Submitted Successfully!")
                setAttachmentGroups([])
                setAttachmentComment('')
                setShowCommentBox(false)
                setFiles([])
                window.location.reload()
            } else {
                alert("Failed to submit: " + res.message)
            }
        } catch (err) {
            console.error(err)
            alert("Error submitting: " + err.message)
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500 relative">
            {/* Cutoff Alert - Compact Popup */}
            {showCutoffAlert && activeCutoff && (
                <div className="fixed top-24 right-4 md:right-8 z-50 animate-in slide-in-from-right fade-in duration-500 max-w-sm w-full">
                    <div className="bg-[#141419] border border-[#f6e05e]/50 p-6 rounded-2xl shadow-2xl relative bg-opacity-95 backdrop-blur-md">
                        <button
                            onClick={() => setShowCutoffAlert(false)}
                            className="absolute top-3 right-3 text-slate-500 hover:text-white transition-colors"
                        >
                            <XCircle size={20} />
                        </button>

                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-[#f6e05e]/10 text-[#f6e05e] rounded-xl shrink-0">
                                <Clock size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white mb-1">DTR Cutoff Active!</h3>
                                <p className="text-slate-400 text-xs mb-3 leading-relaxed">
                                    Period: <span className="text-[#f6e05e] font-mono font-bold">
                                        {new Date(activeCutoff.startDate.toDate()).toLocaleDateString('en-GB')} - {new Date(activeCutoff.endDate.toDate()).toLocaleDateString('en-GB')}
                                    </span>
                                </p>
                                <button
                                    onClick={() => setShowCutoffAlert(false)}
                                    className="text-xs font-bold text-[#f6e05e] hover:text-white transition-colors uppercase tracking-wider"
                                >
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Overlay */}
            {showSuccess && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none">
                    <div className="bg-[#141419] border border-[#22c55e] px-8 py-6 rounded-2xl flex flex-col items-center shadow-xl shadow-green-900/20 animate-in zoom-in">
                        <CheckCircle2 size={48} className="text-[#22c55e] mb-2" />
                        <span className="text-[#22c55e] font-bold text-lg">Request Successful</span>
                    </div>
                </div>
            )}

            {/* Header Section */}
            <div className="flex flex-col gap-1">
                <h2 className="text-3xl font-bold text-white">Dashboard</h2>
                <div className="flex items-center gap-2">
                    <p className="text-slate-500">System overview and activity log</p>
                    {activeCutoff && (
                        <span className="px-2 py-0.5 bg-[#f6e05e]/10 text-[#f6e05e] text-[10px] font-bold uppercase rounded">
                            Cutoff: {new Date(activeCutoff.startDate.toDate()).toLocaleDateString('en-GB')} - {new Date(activeCutoff.endDate.toDate()).toLocaleDateString('en-GB')}
                        </span>
                    )}
                </div>
            </div>

            {/* Action Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

                {/* Clock Card */}
                <div className="bg-[#141419] p-6 rounded-3xl border border-[#1f1f23] hover:border-[#8b5cf6]/50 transition-colors shadow-lg shadow-black/50 lg:col-span-2">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-[#8b5cf6]/10 rounded-xl text-[#8b5cf6]">
                            <Clock size={24} />
                        </div>
                        <span className="text-slate-400 font-medium tracking-wide text-xs uppercase">Current Time</span>
                    </div>
                    <div className="mt-2 text-center md:text-left">
                        <ClockComp />
                    </div>
                </div>

                {/* Time In Card */}
                <button
                    onClick={() => handleLog('IN')}
                    disabled={processing || hasTimeIn}
                    className={`bg-[#141419] p-6 rounded-3xl border border-[#1f1f23] text-left transition-all duration-300 group relative overflow-hidden
                    ${hasTimeIn ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#22c55e] hover:-translate-y-1 hover:shadow-lg hover:shadow-[#22c55e]/10'}
                `}
                >
                    <div className="relative z-10">
                        <div className="p-3 bg-[#22c55e]/10 w-fit rounded-xl text-[#22c55e] mb-6">
                            <CheckCircle size={24} />
                        </div>
                        <h3 className="text-4xl font-bold text-white mb-1">TIME IN</h3>
                        <p className="text-xs font-semibold tracking-widest text-[#22c55e] uppercase">
                            {hasTimeIn ? 'ALREADY LOGGED' : 'START SHIFT'}
                        </p>
                    </div>
                    {/* Glow Effect */}
                    <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-[#22c55e]/10 blur-3xl rounded-full group-hover:bg-[#22c55e]/20 transition-all" />
                </button>

                {/* Time Out Card */}
                <button
                    onClick={() => handleLog('OUT')}
                    disabled={processing || hasTimeOut}
                    className={`bg-[#141419] p-6 rounded-3xl border border-[#1f1f23] text-left transition-all duration-300 group relative overflow-hidden
                    ${hasTimeOut ? 'opacity-50 cursor-not-allowed' : 'hover:border-red-500 hover:-translate-y-1 hover:shadow-lg hover:shadow-red-500/10'}
                `}
                >
                    <div className="relative z-10">
                        <div className="p-3 bg-red-500/10 w-fit rounded-xl text-red-500 mb-6">
                            <XCircle size={24} />
                        </div>
                        <h3 className="text-4xl font-bold text-white mb-1">TIME OUT</h3>
                        <p className="text-xs font-semibold tracking-widest text-red-500 uppercase">
                            {hasTimeOut ? 'ALREADY LOGGED' : 'END SHIFT'}
                        </p>
                    </div>
                    {/* Glow Effect */}
                    <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-red-500/10 blur-3xl rounded-full group-hover:bg-red-500/20 transition-all" />
                </button>
            </div>

            {/* DTR Table View and Submission Panel */}
            {activeCutoff && (
                <>
                    <DTRTable
                        user={user}
                        history={history}
                        onRefresh={loadHistory}
                        initialDate={activeCutoff ? activeCutoff.startDate.toDate() : null}
                        periodEnd={activeCutoff ? activeCutoff.endDate.toDate() : null}
                    />

                    {/* Submission Panel */}
                    <div className="bg-[#141419] rounded-3xl border border-[#1f1f23] p-6 mt-8">
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <Send size={20} className="text-[#8b5cf6]" />
                            Submit DTR
                        </h3>

                        {!activeCutoff ? (
                            <div className="text-slate-500 text-sm">No active cutoff period.</div>
                        ) : submission ? (
                            <div className="flex items-center justify-between bg-[#22c55e]/10 border border-[#22c55e]/20 p-4 rounded-2xl">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-[#22c55e] flex items-center justify-center text-black">
                                        <CheckCircle size={24} />
                                    </div>
                                    <div>
                                        <p className="text-[#22c55e] font-bold">DTR Submitted</p>
                                        <p className="text-xs text-[#22c55e]/80">
                                            Submitted on {new Date(submission.submittedAt.toDate()).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={async () => {
                                        if (window.confirm("Are you sure you want to cancel your previous submission to make changes?")) {
                                            const res = await api.deleteSubmission(submission.id);
                                            if (res.success) {
                                                setSubmission(null);
                                            } else {
                                                alert("Failed to cancel submission");
                                            }
                                        }
                                    }}
                                    className="px-4 py-2 bg-[#1f1f23] hover:bg-[#2d2d35] text-white text-xs font-bold rounded-xl border border-[#22c55e]/30 hover:border-[#22c55e] transition-all shadow-lg shadow-black/20 flex items-center gap-2 group"
                                >
                                    <Clock size={14} className="group-hover:text-[#22c55e] transition-colors" />
                                    Resubmit / Update
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Saved Attachment Groups List */}
                                {attachmentGroups.length > 0 && (
                                    <div className="space-y-3">
                                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                                            Attachments ({attachmentGroups.length})
                                        </p>
                                        {attachmentGroups.map((group, idx) => (
                                            <div key={idx} className="p-3 bg-[#1a1a22] border border-[#22c55e]/20 rounded-xl flex items-start gap-3 animate-in fade-in duration-300">
                                                <div className="p-2 bg-[#8b5cf6]/10 rounded-lg shrink-0">
                                                    <Upload size={14} className="text-[#8b5cf6]" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-white font-bold mb-0.5">
                                                        {group.files.map(f => f.name).join(', ')}
                                                    </p>
                                                    <p className="text-[10px] text-slate-500 mb-1">
                                                        {group.files.length} file(s)
                                                    </p>
                                                    <div className="flex items-start gap-1.5">
                                                        <MessageSquare size={12} className="text-[#8b5cf6] mt-0.5 shrink-0" />
                                                        <p className="text-xs text-slate-300 leading-relaxed">{group.comment}</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleRemoveGroup(idx)}
                                                    className="p-1.5 hover:bg-red-500/10 rounded-lg text-slate-600 hover:text-red-400 transition-all shrink-0"
                                                    title="Remove attachment"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Upload Area */}
                                <div className="p-4 bg-[#1f1f23] rounded-xl border border-dashed border-slate-700 flex flex-col items-center justify-center text-center gap-2 mt-4">
                                    <Upload className="text-slate-500" />
                                    <p className="text-sm text-slate-400">
                                        {attachmentGroups.length > 0 ? 'Add another attachment' : 'Upload image/ attachments (Optional)'}
                                    </p>
                                    <input
                                        type="file"
                                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.zip,.rar"
                                        multiple
                                        onChange={handleFileChange}
                                        className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-[#8b5cf6] file:text-white hover:file:bg-[#7c3aed]"
                                    />
                                    {files.length > 0 && (
                                        <div className="text-xs text-slate-400 italic mt-2">
                                            {files.length} file(s) selected
                                        </div>
                                    )}
                                </div>

                                {/* Comment Box - appears after file selection */}
                                {showCommentBox && (
                                    <div className="p-4 bg-[#1a1a22] rounded-xl border border-[#8b5cf6]/30 animate-in slide-in-from-top fade-in duration-300">
                                        <div className="flex items-center gap-2 mb-3">
                                            <MessageSquare size={16} className="text-[#8b5cf6]" />
                                            <label className="text-sm font-bold text-white">What is this for?</label>
                                            <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">Required</span>
                                        </div>
                                        <textarea
                                            value={attachmentComment}
                                            onChange={(e) => setAttachmentComment(e.target.value)}
                                            placeholder="Describe the purpose of this attachment..."
                                            rows={3}
                                            className="w-full bg-[#141419] text-white text-sm px-4 py-3 rounded-lg border border-slate-700 focus:outline-none focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/30 resize-none placeholder:text-slate-600 transition-all"
                                        />
                                        <div className="flex justify-end gap-2 mt-3">
                                            <button
                                                onClick={handleCancelComment}
                                                className="flex items-center gap-1.5 px-4 py-2 bg-[#1f1f23] hover:bg-[#2d2d35] text-slate-400 hover:text-white text-xs font-bold rounded-lg border border-slate-700 transition-all"
                                            >
                                                <X size={14} />
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleSaveComment}
                                                className="flex items-center gap-1.5 px-4 py-2 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-xs font-bold rounded-lg transition-all shadow-lg shadow-purple-900/20"
                                            >
                                                <Save size={14} />
                                                Save Comment
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {uploading && (
                                    <div className="mt-4 p-3 bg-[#8b5cf6]/20 text-[#8b5cf6] text-center rounded-xl text-xs font-bold animate-pulse">
                                        Uploading and sending... please wait.
                                    </div>
                                )}

                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Recent Requests Table */}
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
                                    const isManual = !!log.reason || log.type === 'OT_IN' || log.type === 'OT_OUT'
                                    const isEditLog = log.type === 'EDIT'

                                    return (
                                        <tr key={log.id} className={`hover:bg-white/5 transition-colors ${isEditLog ? 'cursor-pointer hover:bg-[#f59e0b]/5' : ''}`} onClick={() => isEditLog && setSelectedEditLog(log)}>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-2 h-2 rounded-full ${config.dot}`} />
                                                    <span className="font-bold text-sm" style={{ color: config.color }}>{config.label}</span>
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
                                                    <span className="text-white">{log.reason}</span>
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
                                <div className="p-4 bg-[#1a1a22] rounded-xl border border-[#1f1f23]">
                                    <p className="text-sm text-slate-300 leading-relaxed">
                                        {selectedEditLog.reason || 'No details available.'}
                                    </p>
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

            {/* Hidden Button to allow Sidebar to trigger form submit */}
            <button id="hidden-submit-dtr-btn" className="hidden" onClick={handleSubmitDTR} />
        </div>
    )
}
