import { X, Clock, Check, XCircle } from 'lucide-react'
import { useState, useEffect } from 'react'
import { api } from '../services/api'

export default function NotificationToast({
    notification,
    onDismiss,
    onApprove,
    onDecline
}) {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        if (notification) {
            setVisible(true)
            // Auto dismiss after 10 seconds? Maybe not for approvals.
        }
    }, [notification])

    const handleClose = () => {
        setVisible(false)
        setTimeout(() => {
            onDismiss(notification.id)
        }, 300) // Wait for animation
    }

    if (!notification) return null

    return (
        <div className={`fixed bottom-4 right-4 z-50 transition-all duration-500 transform ${visible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0 pointer-events-none'}`}>
            <div className="bg-[#141419] border border-amber-500/30 rounded-2xl shadow-2xl p-4 w-80 relative overflow-hidden group">
                {/* Glow Effect */}
                <div className="absolute top-0 left-0 w-full h-1 bg-amber-500/50"></div>
                <div className="absolute -left-10 -top-10 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl group-hover:bg-amber-500/20 transition-all"></div>

                <button
                    onClick={handleClose}
                    className="absolute top-3 right-3 text-slate-500 hover:text-white transition-colors"
                >
                    <X size={16} />
                </button>

                <div className="flex gap-4 relative z-10">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 flex-shrink-0">
                        <Clock size={24} />
                    </div>

                    <div className="flex-1">
                        <h4 className="text-white font-bold text-sm mb-1">{notification.title}</h4>
                        <p className="text-slate-400 text-xs leading-relaxed mb-3">
                            {notification.message}
                        </p>

                        {notification.type === 'OT_APPROVAL' && (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => onApprove(notification)}
                                    className="flex-1 py-1.5 bg-[#22c55e] hover:bg-[#16a34a] text-black text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1"
                                >
                                    <Check size={12} /> Approve
                                </button>
                                <button
                                    onClick={() => onDecline(notification)}
                                    className="flex-1 py-1.5 bg-[#1f1f23] hover:bg-red-500/20 text-red-500 border border-slate-700 hover:border-red-500/50 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1"
                                >
                                    <XCircle size={12} /> Decline
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
