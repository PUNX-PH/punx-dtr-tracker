import { useState, useRef, useEffect } from 'react'
import { Bell, Clock, XCircle, CheckCircle } from 'lucide-react'

const ACTIONABLE_TYPES = new Set(['OT_APPROVAL', 'DTR_APPROVAL'])

const typeIcon = (type) => {
    if (type === 'DTR_REJECTED') return <XCircle size={16} className="text-[var(--accent-red)]" />
    if (type === 'DTR_APPROVED' || type === 'OT_APPROVED') return <CheckCircle size={16} className="text-[var(--accent-green)]" />
    return <Clock size={16} className="text-[var(--accent-yellow)]" />
}

const formatTime = (ts) => {
    if (!ts || typeof ts.toDate !== 'function') return ''
    const d = ts.toDate()
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

export default function NotificationBell({
    notifications,
    onApprove,
    onDecline,
    onMarkRead,
    onMarkAllRead,
    onNotificationClick
}) {
    const [open, setOpen] = useState(false)
    const wrapRef = useRef(null)

    useEffect(() => {
        if (!open) return
        const onDocClick = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
        }
        document.addEventListener('mousedown', onDocClick)
        return () => document.removeEventListener('mousedown', onDocClick)
    }, [open])

    const unreadCount = notifications.filter(n => !n.read).length

    return (
        <div ref={wrapRef} className="fixed top-4 right-4 md:top-8 md:right-8 z-40">
            <button
                onClick={() => setOpen(o => !o)}
                className="relative w-11 h-11 bg-[var(--surface-1)] border border-[var(--border)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors flex items-center justify-center shadow-lg"
                aria-label={`${unreadCount} unread notifications`}
                title="Notifications"
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[var(--accent-red)] text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-[var(--surface-0)]">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-[var(--surface-1)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden">
                    <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">Notifications</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={onMarkAllRead}
                                className="text-xs text-[var(--accent-purple)] hover:text-[var(--text-primary)] transition-colors font-medium"
                            >
                                Mark all read
                            </button>
                        )}
                    </div>

                    <div className="max-h-[480px] overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="text-center py-12 text-[var(--text-muted)] text-sm">
                                No notifications yet
                            </div>
                        ) : (
                            <div className="divide-y divide-[var(--border)]">
                                {notifications.map(n => {
                                    const isNavigable = !!n.data?.employeeId

                                    return (
                                        <div
                                            key={n.id}
                                            onClick={isNavigable ? () => { onNotificationClick?.(n); setOpen(false) } : undefined}
                                            className={`p-4 ${!n.read ? 'bg-[var(--surface-2)]' : ''} ${isNavigable ? 'cursor-pointer hover:bg-white/5' : ''}`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="mt-0.5 shrink-0">{typeIcon(n.type)}</div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <p className="text-sm font-bold text-[var(--text-primary)]">{n.title}</p>
                                                        {!n.read && <span className="w-2 h-2 bg-[var(--accent-purple)] rounded-full mt-1 shrink-0" />}
                                                    </div>
                                                    <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed break-words">
                                                        {n.message}
                                                    </p>
                                                    <p className="text-[10px] text-[var(--text-muted)] mt-2">{formatTime(n.createdAt)}</p>

                                                    {ACTIONABLE_TYPES.has(n.type) && !n.read ? (
                                                        <div className="flex gap-4 mt-3">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); onApprove(n) }}
                                                                className="text-xs font-bold text-[var(--accent-green)] hover:text-[var(--accent-green-hover)] uppercase tracking-wider transition-colors"
                                                            >
                                                                Approve
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); onDecline(n) }}
                                                                className="text-xs font-bold text-[var(--accent-red)] hover:text-[var(--accent-red-hover)] uppercase tracking-wider transition-colors"
                                                            >
                                                                Reject
                                                            </button>
                                                        </div>
                                                    ) : !n.read ? (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onMarkRead(n) }}
                                                            className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mt-2 uppercase tracking-wider"
                                                        >
                                                            Mark as read
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
