import { useState, useEffect, useRef } from 'react'
import { CheckCircle2, Clock, CheckCircle, XCircle, Send, Upload, MessageSquare, X, Save, Pencil, ChevronLeft, ChevronRight, Eye, Link as LinkIcon } from 'lucide-react'
import { api } from '../services/api'
import ClockComp from './Clock'
import DTRTable from './DTRTable'
import RecentActivityTable from './RecentActivityTable'

export default function Dashboard({ user }) {
    const submissionDraftKey = `dtr_submission_draft_${user.id}`

    // Read synchronously as part of initial state — not in a useEffect — so a
    // refresh shows the restored comment/links on the very first paint instead
    // of racing a later effect to restore it.
    const readSubmissionDraft = () => {
        try {
            const saved = localStorage.getItem(submissionDraftKey)
            return saved ? JSON.parse(saved) : null
        } catch (e) {
            console.warn('Failed to restore submission draft', e)
            return null
        }
    }
    const initialSubmissionDraft = readSubmissionDraft()
    const initialSubmissionLinks = Array.isArray(initialSubmissionDraft?.submissionLinks) && initialSubmissionDraft.submissionLinks.length > 0
        ? initialSubmissionDraft.submissionLinks
        : []
    const initialLinkInput = initialSubmissionDraft?.linkInput || ''
    const initialAttachmentComment = initialSubmissionDraft?.attachmentComment || ''

    const [history, setHistory] = useState([])
    const [processing, setProcessing] = useState(false)
    const [showSuccess, setShowSuccess] = useState(false)
    const [activeCutoff, setActiveCutoff] = useState(null)
    const [submission, setSubmission] = useState(null)
    const [showCutoffAlert, setShowCutoffAlert] = useState(false)
    const [files, setFiles] = useState([])
    const [uploading, setUploading] = useState(false)
    const [attachmentComment, setAttachmentComment] = useState(initialAttachmentComment)
    const [showCommentBox, setShowCommentBox] = useState(!!initialAttachmentComment)
    const [attachmentGroups, setAttachmentGroups] = useState([]) // Array of { files: File[], comment: string }
    const [submissionLinks, setSubmissionLinks] = useState(initialSubmissionLinks) // Array of url strings
    const [showLinkBox, setShowLinkBox] = useState(!!initialLinkInput)
    const [linkInput, setLinkInput] = useState(initialLinkInput)
    // Stats for the cards (calculated from history)
    const todayLogs = history.filter(h => new Date(h.timestamp).toDateString() === new Date().toDateString());
    const hasTimeIn = todayLogs.some(l => l.type === 'IN');
    const hasTimeOut = todayLogs.some(l => l.type === 'OUT');

    const hasMountedDraftRef = useRef(false)

    useEffect(() => {
        loadHistory()
        checkCutoff()
    }, [user.id])

    // Keep the draft in sync so an accidental refresh doesn't lose it.
    // Skips its very first run: the state above already matches localStorage
    // from the initial read, so writing again there is redundant.
    useEffect(() => {
        if (!hasMountedDraftRef.current) {
            hasMountedDraftRef.current = true
            return
        }
        try {
            const hasDraft = submissionLinks.length > 0 || !!linkInput || !!attachmentComment
            if (hasDraft) {
                localStorage.setItem(submissionDraftKey, JSON.stringify({ submissionLinks, linkInput, attachmentComment }))
            } else {
                localStorage.removeItem(submissionDraftKey)
            }
        } catch (e) {
            console.warn('Failed to persist submission draft', e)
        }
    }, [submissionLinks, linkInput, attachmentComment, submissionDraftKey])

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

    // Disable the Sidebar "Send to Admin" button dynamically if submitted
    useEffect(() => {
        const btn = document.getElementById('sidebar-send-btn');
        if (btn) {
            if (submission && submission.status !== 'rejected') {
                btn.disabled = true;
                btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle-2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg> DTR Sent`;
            } else {
                btn.disabled = false;
                btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg> Send to Admin`;
            }
        }
    }, [submission]);

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
            setShowLinkBox(false)
            setAttachmentComment('')
        }
    }

    const handleSaveComment = () => {
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
        if (submission && submission.status !== 'rejected') return alert("You have already submitted your DTR. Please click 'Resubmit / Update' first to make changes.")
        if (!activeCutoff) return alert("No active cutoff period")
        if (showCommentBox || showLinkBox) {
            return alert("Please save or cancel your current attachment or link first.")
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

            const res = await api.submitDTR(user.id, activeCutoff.id, allBase64, allComments, submissionLinks)
            if (res.success) {
                alert("DTR Submitted Successfully!")
                setAttachmentGroups([])
                setSubmissionLinks([])
                setAttachmentComment('')
                setLinkInput('')
                setShowCommentBox(false)
                setShowLinkBox(false)
                setFiles([])
                // Clear synchronously — the reload below happens before React
                // would otherwise get a chance to run the persist effect.
                localStorage.removeItem(submissionDraftKey)
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
                <div className="fixed inset-x-3 top-[calc(4.5rem+env(safe-area-inset-top,0px))] md:inset-x-auto md:top-24 md:right-8 z-50 animate-in slide-in-from-right fade-in duration-500 w-auto md:w-full md:max-w-sm">
                    <div className="bg-[var(--surface-1)] border border-[var(--accent-yellow)]/50 p-5 md:p-6 rounded-2xl shadow-2xl relative bg-opacity-95 backdrop-blur-md">
                        <button
                            onClick={() => setShowCutoffAlert(false)}
                            className="absolute top-3 right-3 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        >
                            <XCircle size={20} />
                        </button>

                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-[var(--accent-yellow)]/10 text-[var(--accent-yellow)] rounded-xl shrink-0">
                                <Clock size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">DTR Cutoff Active!</h3>
                                <p className="text-[var(--text-secondary)] text-xs mb-3 leading-relaxed">
                                    Period: <span className="text-[var(--accent-yellow)] font-mono font-bold">
                                        {new Date(activeCutoff.startDate.toDate()).toLocaleDateString('en-GB')} - {new Date(activeCutoff.endDate.toDate()).toLocaleDateString('en-GB')}
                                    </span>
                                </p>
                                <button
                                    onClick={() => setShowCutoffAlert(false)}
                                    className="text-xs font-bold text-[var(--accent-yellow)] hover:text-[var(--text-primary)] transition-colors uppercase tracking-wider"
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
                    <div className="bg-[var(--surface-1)] border border-[var(--accent-green)] mx-4 px-6 sm:px-8 py-6 rounded-2xl flex flex-col items-center shadow-xl shadow-green-900/20 animate-in zoom-in">
                        <CheckCircle2 size={48} className="text-[var(--accent-green)] mb-2" />
                        <span className="text-[var(--accent-green)] font-bold text-lg">Request Successful</span>
                    </div>
                </div>
            )}

            {/* Header Section */}
            <div className="flex flex-col gap-1">
                <h2 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">Dashboard</h2>
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[var(--text-muted)]">System overview and activity log</p>
                    {activeCutoff && (
                        <span className="px-2 py-0.5 bg-[var(--accent-yellow)]/10 text-[var(--accent-yellow)] text-[10px] font-bold uppercase rounded">
                            Cutoff: {new Date(activeCutoff.startDate.toDate()).toLocaleDateString('en-GB')} - {new Date(activeCutoff.endDate.toDate()).toLocaleDateString('en-GB')}
                        </span>
                    )}
                </div>
            </div>

            {/* Action Cards */}
            <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">

                {/* Clock Card */}
                <div className="bg-[var(--surface-1)] p-5 sm:p-6 rounded-3xl border border-[var(--border)] hover:border-[var(--accent-purple)]/50 transition-colors shadow-lg shadow-black/50 xs:col-span-2">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-[var(--accent-purple)]/10 rounded-xl text-[var(--accent-purple)]">
                            <Clock size={24} />
                        </div>
                        <span className="text-[var(--text-secondary)] font-medium tracking-wide text-xs uppercase">Current Time</span>
                    </div>
                    <div className="mt-2 text-center md:text-left">
                        <ClockComp />
                    </div>
                </div>

                {/* Time In Card */}
                <button
                    onClick={() => handleLog('IN')}
                    disabled={processing || hasTimeIn}
                    className={`bg-[var(--surface-1)] p-5 sm:p-6 rounded-3xl border border-[var(--border)] text-left transition-all duration-300 group relative overflow-hidden
                    ${hasTimeIn ? 'opacity-50 cursor-not-allowed' : 'hover:border-[var(--accent-green)] active:scale-[0.99] hover:-translate-y-1 hover:shadow-lg hover:shadow-[var(--accent-green)]/10'}
                `}
                >
                    <div className="relative z-10">
                        <div className="p-3 bg-[var(--accent-green)]/10 w-fit rounded-xl text-[var(--accent-green)] mb-4 sm:mb-6">
                            <CheckCircle size={24} />
                        </div>
                        <h3 className="text-3xl sm:text-4xl font-bold text-[var(--text-primary)] mb-1">TIME IN</h3>
                        <p className="text-xs font-semibold tracking-widest text-[var(--accent-green)] uppercase">
                            {hasTimeIn ? 'ALREADY LOGGED' : 'START SHIFT'}
                        </p>
                    </div>
                    {/* Glow Effect */}
                    <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-[var(--accent-green)]/10 blur-3xl rounded-full group-hover:bg-[var(--accent-green)]/20 transition-all" />
                </button>

                {/* Time Out Card */}
                <button
                    onClick={() => handleLog('OUT')}
                    disabled={processing || hasTimeOut}
                    className={`bg-[var(--surface-1)] p-5 sm:p-6 rounded-3xl border border-[var(--border)] text-left transition-all duration-300 group relative overflow-hidden
                    ${hasTimeOut ? 'opacity-50 cursor-not-allowed' : 'hover:border-[var(--accent-red)] active:scale-[0.99] hover:-translate-y-1 hover:shadow-lg hover:shadow-red-500/10'}
                `}
                >
                    <div className="relative z-10">
                        <div className="p-3 bg-[var(--accent-red)]/10 w-fit rounded-xl text-[var(--accent-red)] mb-4 sm:mb-6">
                            <XCircle size={24} />
                        </div>
                        <h3 className="text-3xl sm:text-4xl font-bold text-[var(--text-primary)] mb-1">TIME OUT</h3>
                        <p className="text-xs font-semibold tracking-widest text-[var(--accent-red)] uppercase">
                            {hasTimeOut ? 'ALREADY LOGGED' : 'END SHIFT'}
                        </p>
                    </div>
                    {/* Glow Effect */}
                    <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-[var(--accent-red)]/10 blur-3xl rounded-full group-hover:bg-[var(--accent-red)]/20 transition-all" />
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
                    <div className="bg-[var(--surface-1)] rounded-3xl border border-[var(--border)] p-4 sm:p-6 mt-8">
                        <h3 className="text-xl font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                            <Send size={20} className="text-[var(--accent-purple)]" />
                            Submit DTR
                        </h3>

                        {!activeCutoff ? (
                            <div className="text-[var(--text-muted)] text-sm">No active cutoff period.</div>
                        ) : submission && submission.status !== 'rejected' ? (
                            <div className="space-y-4">
                                {submission.status === 'approved' ? (
                                    <div className="flex items-start gap-4 p-4 bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/20 rounded-2xl animate-in fade-in slide-in-from-top-2">
                                        <div className="w-10 h-10 rounded-full bg-[var(--accent-green)]/20 flex items-center justify-center text-[var(--accent-green)] shrink-0">
                                            <CheckCircle size={24} />
                                        </div>
                                        <div>
                                            <p className="text-[var(--accent-green)] font-bold mb-1">DTR Approved</p>
                                            <p className="text-xs text-[var(--accent-green)]/80 leading-relaxed max-w-lg">
                                                Great news! Your DTR has been fully reviewed and approved by your senior. No further actions are required.
                                            </p>
                                            <p className="text-[10px] text-[var(--accent-green)]/60 mt-2">
                                                Submitted on {new Date(submission.submittedAt.toDate()).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--accent-amber)]/10 border border-[var(--accent-amber)]/20 p-4 rounded-2xl animate-in fade-in">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-[var(--accent-amber)]/20 flex items-center justify-center text-[var(--accent-amber)]">
                                                <Clock size={24} />
                                            </div>
                                            <div>
                                                <p className="text-[var(--accent-amber)] font-bold">DTR Submitted (Pending Review)</p>
                                                <p className="text-xs text-[var(--accent-amber)]/80">
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
                                            className="px-4 py-2.5 bg-[var(--surface-3)] hover:bg-[var(--surface-3-hover)] text-[var(--text-primary)] text-xs font-bold rounded-xl border border-[var(--accent-amber)]/30 hover:border-[var(--accent-amber)] transition-all shadow-lg shadow-black/20 flex items-center justify-center gap-2 group shrink-0 w-full sm:w-auto"
                                        >
                                            <Pencil size={14} className="group-hover:text-[var(--accent-amber)] transition-colors" />
                                            Resubmit / Update
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {submission && submission.status === 'rejected' && (
                                    <div className="flex items-start gap-4 p-4 bg-[var(--accent-red)]/10 border border-[var(--accent-red)]/20 rounded-2xl animate-in fade-in slide-in-from-top-2">
                                        <div className="w-10 h-10 rounded-full bg-[var(--accent-red)]/20 flex items-center justify-center text-[var(--accent-red)] shrink-0">
                                            <XCircle size={24} />
                                        </div>
                                        <div>
                                            <p className="text-[var(--accent-red)] font-bold mb-1">DTR Rejected</p>
                                            <p className="text-xs text-[var(--accent-red)]/80 leading-relaxed max-w-lg">
                                                Your submission was rejected by your assigned senior. Please update your time records or upload any missing attachments below before resubmitting.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Render previous attachments if rejected */}
                                {submission && submission.attachments && submission.attachments.length > 0 && (
                                    <div className="space-y-3">
                                        <p className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider">
                                            Previously Uploaded Attachments
                                        </p>
                                        {submission.attachmentComments?.map((commentObj, idx) => (
                                            <div key={idx} className="p-3 bg-[var(--surface-2)] border border-[var(--border-strong)]/50 rounded-xl flex items-start gap-3">
                                                <div className="p-2 bg-[var(--surface-3)] rounded-lg shrink-0">
                                                    <Upload size={14} className="text-[var(--text-secondary)]" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[10px] text-[var(--text-muted)] mb-1">
                                                        {commentObj.fileCount} previous file(s) attached
                                                    </p>
                                                    {commentObj.comment && (
                                                        <div className="flex items-start gap-1.5">
                                                            <MessageSquare size={12} className="text-[var(--text-muted)] mt-0.5 shrink-0" />
                                                            <p className="text-xs text-[var(--text-secondary)] leading-relaxed italic">"{commentObj.comment}"</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {/* Saved Attachment Groups and Links List */}
                                {(attachmentGroups.length > 0 || submissionLinks.length > 0) && (
                                    <div className="space-y-3">
                                        <p className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider">
                                            Image/ Attachments ({attachmentGroups.length + submissionLinks.length})
                                        </p>

                                        {/* URLs */}
                                        {submissionLinks.map((url, idx) => (
                                            <div key={`link-${idx}`} className="p-3 bg-[var(--surface-2)] border border-[var(--accent-blue)]/20 rounded-xl flex items-start gap-3 animate-in fade-in duration-300">
                                                <div className="p-2 bg-[var(--accent-blue)]/10 rounded-lg shrink-0">
                                                    <LinkIcon size={14} className="text-[var(--accent-blue)]" />
                                                </div>
                                                <div className="flex-1 min-w-0 flex items-center h-full">
                                                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline break-all">{url}</a>
                                                </div>
                                                <button
                                                    onClick={() => setSubmissionLinks(prev => prev.filter((_, i) => i !== idx))}
                                                    className="p-1.5 hover:bg-[var(--accent-red)]/10 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-red)] transition-all shrink-0"
                                                    title="Remove link"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))}

                                        {/* Files */}
                                        {attachmentGroups.map((group, idx) => (
                                            <div key={idx} className="p-3 bg-[var(--surface-2)] border border-[var(--accent-green)]/20 rounded-xl flex items-start gap-3 animate-in fade-in duration-300">
                                                <div className="p-2 bg-[var(--accent-purple)]/10 rounded-lg shrink-0">
                                                    <Upload size={14} className="text-[var(--accent-purple)]" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-[var(--text-primary)] font-bold mb-0.5">
                                                        {group.files.map(f => f.name).join(', ')}
                                                    </p>
                                                    <p className="text-[10px] text-[var(--text-muted)] mb-1">
                                                        {group.files.length} file(s)
                                                    </p>
                                                    <div className="flex items-start gap-1.5">
                                                        <MessageSquare size={12} className="text-[var(--accent-purple)] mt-0.5 shrink-0" />
                                                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{group.comment}</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleRemoveGroup(idx)}
                                                    className="p-1.5 hover:bg-[var(--accent-red)]/10 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-red)] transition-all shrink-0"
                                                    title="Remove attachment"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Upload Area */}
                                <div className="p-4 bg-[var(--surface-3)] rounded-xl border border-dashed border-[var(--border-strong)] flex flex-col items-center justify-center text-center gap-2 mt-4">
                                    <Upload className="text-[var(--text-muted)]" />
                                    <p className="text-sm text-[var(--text-secondary)]">
                                        {attachmentGroups.length > 0 || submissionLinks.length > 0 ? 'Add another attachment' : 'Upload image/ attachments (Optional)'}
                                    </p>
                                    <input
                                        type="file"
                                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.zip,.rar"
                                        multiple
                                        onChange={handleFileChange}
                                        className="max-w-full text-xs text-[var(--text-muted)] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-[var(--accent-purple)] file:text-white hover:file:bg-[var(--accent-purple-hover)]"
                                    />
                                    {files.length > 0 && (
                                        <div className="text-xs text-[var(--text-secondary)] italic mt-2">
                                            {files.length} file(s) selected
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-center mt-2">
                                    <button
                                        onClick={() => {
                                            setShowLinkBox(true);
                                            setShowCommentBox(false);
                                        }}
                                        className="text-xs text-[var(--accent-purple)] hover:text-[var(--text-primary)] flex items-center gap-1 transition-colors py-2 px-3 md:py-0 md:px-0"
                                    >
                                        <LinkIcon size={12} />
                                        <span>Or add a URL Link</span>
                                    </button>
                                </div>

                                {/* Link Input Box */}
                                {showLinkBox && (
                                    <div className="p-4 bg-[var(--surface-2)] rounded-xl border border-[var(--accent-blue)]/30 animate-in slide-in-from-top fade-in duration-300">
                                        <div className="flex items-center gap-2 mb-3">
                                            <LinkIcon size={16} className="text-[var(--accent-blue)]" />
                                            <label className="text-sm font-bold text-[var(--text-primary)]">Paste URL Link</label>
                                        </div>
                                        <input
                                            type="url"
                                            value={linkInput}
                                            onChange={(e) => setLinkInput(e.target.value)}
                                            placeholder="https://..."
                                            className="w-full px-3 py-2 bg-black/50 border border-[var(--border-strong)]/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)] mb-3"
                                        />
                                        <div className="flex justify-end gap-2 mt-3">
                                            <button
                                                onClick={() => {
                                                    setShowLinkBox(false);
                                                    setLinkInput('');
                                                }}
                                                className="flex items-center gap-1.5 px-4 py-2 bg-[var(--surface-3)] hover:bg-[var(--surface-3-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold rounded-lg border border-[var(--border-strong)] transition-all"
                                            >
                                                <X size={14} />
                                                Cancel
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (linkInput.trim()) {
                                                        setSubmissionLinks(prev => [...prev, linkInput.trim()]);
                                                        setShowLinkBox(false);
                                                        setLinkInput('');
                                                    }
                                                }}
                                                className="flex items-center gap-1.5 px-4 py-2 bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-hover)] text-white text-xs font-bold rounded-lg transition-all shadow-lg shadow-blue-900/20"
                                            >
                                                <Save size={14} />
                                                Add Link
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Comment Box - appears after file selection */}
                                {showCommentBox && (
                                    <div className="p-4 bg-[var(--surface-2)] rounded-xl border border-[var(--accent-purple)]/30 animate-in slide-in-from-top fade-in duration-300">
                                        <div className="flex items-center gap-2 mb-3">
                                            <MessageSquare size={16} className="text-[var(--accent-purple)]" />
                                            <label className="text-sm font-bold text-[var(--text-primary)]">Any notes for these files?</label>
                                            <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Optional</span>
                                        </div>
                                        <textarea
                                            value={attachmentComment}
                                            onChange={(e) => setAttachmentComment(e.target.value)}
                                            placeholder="Example: Medical Certificate for 03/04 (Optional)..."
                                            className="w-full h-20 px-3 py-2 bg-black/50 border border-[var(--border-strong)]/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[var(--accent-purple)] focus:ring-1 focus:ring-[var(--accent-purple)] resize-none mb-3"
                                        />
                                        <div className="flex justify-end gap-2 mt-3">
                                            <button
                                                onClick={handleCancelComment}
                                                className="flex items-center gap-1.5 px-4 py-2 bg-[var(--surface-3)] hover:bg-[var(--surface-3-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold rounded-lg border border-[var(--border-strong)] transition-all"
                                            >
                                                <X size={14} />
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleSaveComment}
                                                className="flex items-center gap-1.5 px-4 py-2 bg-[var(--accent-purple)] hover:bg-[var(--accent-purple-hover)] text-white text-xs font-bold rounded-lg transition-all shadow-lg shadow-purple-900/20"
                                            >
                                                <Save size={14} />
                                                Save Comment
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {uploading && (
                                    <div className="mt-4 p-3 bg-[var(--accent-purple)]/20 text-[var(--accent-purple)] text-center rounded-xl text-xs font-bold animate-pulse">
                                        Uploading and sending... please wait.
                                    </div>
                                )}

                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Recent Requests Table (Extracted Component) */}
            <RecentActivityTable history={history} />

            {/* Hidden Button to allow Sidebar to trigger form submit */}
            <button id="hidden-submit-dtr-btn" className="hidden" onClick={handleSubmitDTR} />
        </div>
    )
}
