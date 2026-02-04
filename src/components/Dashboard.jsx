import { useState, useEffect } from 'react'
import { CheckCircle2, Clock, CheckCircle, XCircle, Send, Upload } from 'lucide-react'
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
        if (e.target.files) {
            setFiles(Array.from(e.target.files))
        }
    }

    const handleSubmitDTR = async () => {
        if (files.length === 0) return alert("Please select at least one image")
        if (!activeCutoff) return alert("No active cutoff period")

        setUploading(true)
        try {
            // Convert ALL files to Base64
            const promises = files.map(file => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                })
            })

            const base64Array = await Promise.all(promises)

            const res = await api.submitDTR(user.id, activeCutoff.id, base64Array)
            if (res.success) {
                alert("DTR Submitted Successfully!")
                setSubmission({
                    status: 'pending',
                    submittedAt: new Date().toISOString()
                })
                setShowCutoffAlert(false)
                setFiles([]) // Clear files
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
            {/* Cutoff Alert Modal */}
            {showCutoffAlert && activeCutoff && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-[#141419] border border-[#f6e05e]/50 p-8 rounded-3xl max-w-md w-full shadow-2xl relative">
                        <button onClick={() => setShowCutoffAlert(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white"><XCircle size={24} /></button>
                        <h3 className="text-2xl font-bold text-white mb-2">DTR Cutoff Active!</h3>
                        <p className="text-slate-400 mb-6">
                            The cutoff period <span className="text-[#f6e05e] font-mono font-bold">
                                {new Date(activeCutoff.startDate.toDate()).toLocaleDateString()} - {new Date(activeCutoff.endDate.toDate()).toLocaleDateString()}
                            </span> is currently active.
                        </p>
                        <p className="text-sm text-slate-500 mb-6">Please verify your logs and submit your DTR with signature below.</p>
                        <button
                            onClick={() => setShowCutoffAlert(false)}
                            className="w-full py-3 bg-[#f6e05e] hover:bg-[#d6bc3d] text-black font-bold rounded-xl transition-colors"
                        >
                            Okay, I'll Submit
                        </button>
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
                            Cutoff: {new Date(activeCutoff.startDate.toDate()).toLocaleDateString()} - {new Date(activeCutoff.endDate.toDate()).toLocaleDateString()}
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
                    {/* Submission Panel */}
                    <div className="bg-[#141419] rounded-3xl border border-[#1f1f23] p-6 mb-8">
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
                                    onClick={() => setSubmission(null)} // Reset local state to show form again
                                    className="px-4 py-2 bg-[#1f1f23] hover:bg-[#2d2d35] text-white text-xs font-bold rounded-xl border border-[#22c55e]/30 hover:border-[#22c55e] transition-all shadow-lg shadow-black/20 flex items-center gap-2 group"
                                >
                                    <Clock size={14} className="group-hover:text-[#22c55e] transition-colors" />
                                    Resubmit / Update
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="p-4 bg-[#1f1f23] rounded-xl border border-dashed border-slate-700 flex flex-col items-center justify-center text-center gap-2">
                                    <Upload className="text-slate-500" />
                                    <p className="text-sm text-slate-400">Upload image/ attachments</p>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        onChange={handleFileChange}
                                        className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-[#8b5cf6] file:text-white hover:file:bg-[#7c3aed]"
                                    />
                                    {files.length > 0 && (
                                        <div className="text-xs text-slate-400 italic">
                                            {files.length} file(s) selected
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={handleSubmitDTR}
                                    disabled={uploading || files.length === 0}
                                    className="w-full py-3 bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-purple-900/20"
                                >
                                    {uploading ? "Sending..." : "Send to Admin"}
                                </button>
                            </div>
                        )}
                    </div>

                    <DTRTable
                        user={user}
                        history={history}
                        onRefresh={loadHistory}
                        initialDate={activeCutoff ? activeCutoff.startDate.toDate() : null}
                        periodEnd={activeCutoff ? activeCutoff.endDate.toDate() : null}
                    />
                </>
            )}

            {/* Recent Requests Table */}
            <div className="bg-[#141419] rounded-3xl border border-[#1f1f23] overflow-hidden">
                <div className="p-6 border-b border-[#1f1f23] flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-white">Recent Activity</h3>
                        <p className="text-xs text-slate-500">Latest logs</p>
                    </div>
                    <button className="text-xs font-medium text-slate-400 hover:text-white px-3 py-1 bg-[#1f1f23] rounded-lg transition-colors">
                        Manage Requests &rarr;
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-[#1a1a20] text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Time</th>
                                <th className="px-6 py-4 text-right">Verification</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1f1f23]">
                            {history.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                                        No activity found.
                                    </td>
                                </tr>
                            ) : (
                                history.map((log) => (
                                    <tr key={log.id} className="hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-2 h-2 rounded-full ${log.type === 'IN' ? 'bg-[#22c55e]' : 'bg-red-500'}`} />
                                                <span className="font-bold text-sm text-white">{log.type === 'IN' ? 'TIME IN' : 'TIME OUT'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-400 font-medium">
                                            {new Date(log.timestamp).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-400 font-mono">
                                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#22c55e]/10 text-[#22c55e] text-[10px] font-bold uppercase tracking-wider">
                                                <CheckCircle2 size={12} />
                                                Approved
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
