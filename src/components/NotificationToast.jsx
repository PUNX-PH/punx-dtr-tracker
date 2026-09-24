import { X, Clock, Check, XCircle } from 'lucide-react'
import { useState, useEffect } from 'react'
import { api } from '../services/api'

export default function NotificationToast({
    notification,
    onDismiss,
    onApprove,
    onDecline,
    onNotificationClick
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
            onDismiss(notification)
        }, 300) // Wait for animation
    }

    if (!notification) return null

    const isNavigable = !!notification.data?.employeeId
    const handleBodyClick = () => {
        if (!isNavigable) return
        onNotificationClick?.(notification)
        setVisible(false)
    }

    return (
        <div className={`fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] md:inset-x-auto md:bottom-auto md:top-[260px] md:right-8 z-[9999] transition-all duration-500 transform ${visible ? 'translate-y-0 opacity-100' : 'translate-y-10 md:-translate-y-10 opacity-0 pointer-events-none'}`}>
            <div className="bg-[var(--surface-1)] border border-[var(--accent-yellow)]/50 p-5 md:p-6 rounded-2xl shadow-2xl relative bg-opacity-95 backdrop-blur-md w-auto md:w-96 max-w-full md:max-w-[calc(100vw-2rem)]">
                <button
                    onClick={handleClose}
                    className="absolute top-2 right-2 p-2 md:p-0 md:top-3 md:right-3 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                    <XCircle size={20} />
                </button>

                <div
                    className={`flex items-start gap-4 ${isNavigable ? 'cursor-pointer' : ''}`}
                    onClick={handleBodyClick}
                >
                    <div className={`p-3 rounded-xl shrink-0 ${notification.type === 'DTR_REJECTED' ? 'bg-[var(--accent-red)]/10 text-[var(--accent-red)]' : 'bg-[var(--accent-yellow)]/10 text-[var(--accent-yellow)]'}`}>
                        {notification.type === 'DTR_REJECTED' ? <XCircle size={24} /> : <Clock size={24} />}
                    </div>
                    <div className="flex-1 w-full flex flex-col items-start text-left">
                        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">{notification.title}</h3>
                        <p className="text-[var(--text-secondary)] text-xs mb-3 leading-relaxed">
                            {notification.message}
                        </p>

                        {(notification.type === 'OT_APPROVAL' || notification.type === 'DTR_APPROVAL') ? (
                            <div className="flex gap-3 w-full mt-1">
                                <button
                                    onClick={(e) => { e.stopPropagation(); onApprove(notification) }}
                                    className="text-xs font-bold text-[var(--accent-green)] hover:text-[var(--accent-green-hover)] transition-colors uppercase tracking-wider py-2 px-3 rounded-lg bg-[var(--accent-green)]/10 md:bg-transparent md:px-0 md:py-0"
                                >
                                    Approve
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDecline(notification) }}
                                    className="text-xs font-bold text-[var(--accent-red)] hover:text-[var(--accent-red-hover)] transition-colors uppercase tracking-wider py-2 px-3 rounded-lg bg-[var(--accent-red)]/10 md:bg-transparent md:px-0 md:py-0 md:ml-2"
                                >
                                    Reject
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleClose() }}
                                className={`text-xs font-bold transition-colors uppercase tracking-wider ${notification.type === 'DTR_REJECTED' ? 'text-[var(--accent-red)] hover:text-[var(--accent-red-hover)]' : 'text-[var(--accent-yellow)] hover:text-[var(--text-primary)]'}`}
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
