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
            <div className="bg-[#141419] border border-[#f6e05e]/50 p-6 rounded-2xl shadow-2xl relative bg-opacity-95 backdrop-blur-md w-96">
                <button
                    onClick={handleClose}
                    className="absolute top-3 right-3 text-slate-500 hover:text-white transition-colors"
                >
                    <XCircle size={20} />
                </button>

                <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl shrink-0 ${notification.type === 'DTR_REJECTED' ? 'bg-red-500/10 text-red-500' : 'bg-[#f6e05e]/10 text-[#f6e05e]'}`}>
                        {notification.type === 'DTR_REJECTED' ? <XCircle size={24} /> : <Clock size={24} />}
                    </div>
                    <div className="flex-1 w-full flex flex-col items-start text-left">
                        <h3 className="text-lg font-bold text-white mb-1">{notification.title}</h3>
                        <p className="text-slate-400 text-xs mb-3 leading-relaxed">
                            {notification.message}
                        </p>

                        {(notification.type === 'OT_APPROVAL' || notification.type === 'DTR_APPROVAL') ? (
                            <div className="flex gap-3 w-full mt-1">
                                <button
                                    onClick={() => onApprove(notification)}
                                    className="text-xs font-bold text-[#22c55e] hover:text-[#16a34a] transition-colors uppercase tracking-wider"
                                >
                                    Approve
                                </button>
                                <button
                                    onClick={() => onDecline(notification)}
                                    className="text-xs font-bold text-red-500 hover:text-red-400 transition-colors uppercase tracking-wider ml-2"
                                >
                                    Reject
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleClose}
                                className={`text-xs font-bold transition-colors uppercase tracking-wider ${notification.type === 'DTR_REJECTED' ? 'text-red-500 hover:text-red-400' : 'text-[#f6e05e] hover:text-white'}`}
                            >
                                Dismiss
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
