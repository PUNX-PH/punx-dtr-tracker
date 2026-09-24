import { useState, useEffect } from 'react'
import { Menu, X } from 'lucide-react'
import Sidebar from './Sidebar'
import NotificationToast from './NotificationToast'
import NotificationBell from './NotificationBell'
import { api } from '../services/api'

export default function Layout({ children, user, onLogout, activeTab, onTabChange, onNotificationNavigate }) {
    const [isSidebarOpen, setSidebarOpen] = useState(true)
    const [isMobile, setIsMobile] = useState(false)
    const [notification, setNotification] = useState(null)
    const [notifications, setNotifications] = useState([])

    useEffect(() => {
        const checkMobile = () => {
            const mobile = window.innerWidth < 768
            setIsMobile(mobile)
            if (mobile) setSidebarOpen(false)
            else setSidebarOpen(true)
        }

        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    // Notification Listener
    useEffect(() => {
        if (!user) return;

        const unsubscribe = api.getNotifications(user.id, (notifs) => {
            setNotifications(notifs);
            // Auto-pop toast for the most recent unread; the bell holds the
            // full list so users can re-access any closed toast.
            const unread = notifs.filter(n => !n.read);
            setNotification(unread.length > 0 ? unread[0] : null);
        });

        return () => unsubscribe();
    }, [user]);

    const handleDismiss = async (notif) => {
        setNotification(null);
        // Only permanently auto-dismiss read status if it's an informational alert, not an actionable workflow
        if (notif.type !== 'OT_APPROVAL' && notif.type !== 'DTR_APPROVAL') {
            await api.markNotificationRead(notif.id);
        }
    }

    const handleApprove = async (notif) => {
        if (notif.type === 'OT_APPROVAL') {
            await api.updateOTStatus(notif.data.submissionId, 'approved');
            await api.markNotificationRead(notif.id);
            handleDismiss(notif);
            alert(`OT Approved for ${notif.data.employeeName}`);
        } else if (notif.type === 'DTR_APPROVAL') {
            await api.updateDTRStatus(notif.data.submissionId, 'approved', notif.data.employeeId, user.name);
            await api.markNotificationRead(notif.id);
            handleDismiss(notif);
            alert(`DTR Approved for ${notif.data.employeeName}`);
        }
    }

    const handleDecline = async (notif) => {
        if (notif.type === 'OT_APPROVAL') {
            await api.updateOTStatus(notif.data.submissionId, 'declined');
            await api.markNotificationRead(notif.id);
            handleDismiss(notif);
            alert(`OT Declined for ${notif.data.employeeName}`);
        } else if (notif.type === 'DTR_APPROVAL') {
            await api.updateDTRStatus(notif.data.submissionId, 'rejected', notif.data.employeeId, user.name);
            await api.markNotificationRead(notif.id);
            handleDismiss(notif);
            alert(`DTR Rejected for ${notif.data.employeeName}`);
        }
    }

    const handleMarkRead = async (notif) => {
        await api.markNotificationRead(notif.id);
    }

    const handleMarkAllRead = async () => {
        const unread = notifications.filter(n => !n.read);
        if (unread.length === 0) return;
        await api.markNotificationsRead(unread.map(n => n.id));
    }

    // DTR-related notifications carry { submissionId, employeeId }, where
    // submissionId is the `${employeeId}_${cutoffId}` composite doc id — pull
    // the cutoffId back out so the target dashboard can pre-select it.
    const getNotificationFocus = (notif) => {
        const employeeId = notif?.data?.employeeId
        if (!employeeId) return null
        const submissionId = notif?.data?.submissionId
        const prefix = `${employeeId}_`
        const cutoffId = submissionId?.startsWith(prefix) ? submissionId.slice(prefix.length) : null
        return { employeeId, cutoffId }
    }

    const handleNotificationClick = (notif) => {
        const focus = getNotificationFocus(notif)
        if (!focus) return
        if (!notif.read) api.markNotificationRead(notif.id)
        onNotificationNavigate?.(focus)
    }

    return (
        <div className="flex h-[100dvh] bg-[var(--surface-0)] overflow-hidden relative">
            {/* Persistent bell — always visible across every dashboard */}
            <NotificationBell
                notifications={notifications}
                onApprove={handleApprove}
                onDecline={handleDecline}
                onMarkRead={handleMarkRead}
                onMarkAllRead={handleMarkAllRead}
                onNotificationClick={handleNotificationClick}
            />

            {/* Notification Toast (auto-pop for latest unread) */}
            {notification && (
                <NotificationToast
                    notification={notification}
                    onDismiss={handleDismiss}
                    onApprove={handleApprove}
                    onDecline={handleDecline}
                    onNotificationClick={handleNotificationClick}
                />
            )}

            {/* Mobile Overlay */}
            {isMobile && isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/80 z-40 backdrop-blur-sm"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar Wrapper */}
            <div className={`
                fixed md:relative z-50 h-full max-w-[85vw] md:max-w-none
                transition-transform md:transition-all duration-300 ease-in-out
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-0 md:overflow-hidden'}
            `}>
                <div className="h-full relative">
                    {/* Close Button for Mobile */}
                    <button
                        onClick={() => setSidebarOpen(false)}
                        aria-label="Close menu"
                        className="md:hidden absolute top-3 right-3 p-2 -m-0.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] active:bg-[var(--surface-3)] z-50"
                    >
                        <X size={24} />
                    </button>

                    <Sidebar
                        user={user}
                        onLogout={onLogout}
                        activeTab={activeTab}
                        onTabChange={(tab) => {
                            onTabChange(tab)
                            if (isMobile) setSidebarOpen(false)
                        }}
                        onClose={() => setSidebarOpen(false)}
                    />
                </div>
            </div>

            <main className="flex-1 overflow-auto relative">
                {/* Header / Toggle Area — sticky so the menu stays reachable */}
                <header className="md:hidden sticky top-0 z-30 pt-safe px-safe bg-[var(--surface-0)]/90 backdrop-blur-md border-b border-[var(--border)]">
                    <div className="flex items-center gap-3 px-4 py-3 pr-16">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            aria-label="Open menu"
                            className="p-2 bg-[var(--surface-1)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] hover:bg-[var(--surface-3)] active:bg-[var(--surface-3)] transition-colors shrink-0"
                        >
                            <Menu size={24} />
                        </button>
                        <div className="min-w-0">
                            <p className="text-base font-bold tracking-tighter text-[var(--text-primary)] leading-none">PUNX</p>
                            <p className="text-[10px] font-medium tracking-widest text-[var(--text-muted)] mt-0.5">DTR TRACKER</p>
                        </div>
                    </div>
                </header>

                {/* Toggle Button for Desktop (Optional, if user wants to hide sidebar on desktop too) */}
                {!isMobile && !isSidebarOpen && (
                    <div className="absolute top-8 left-8 z-30">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="p-3 bg-[var(--surface-1)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors shadow-xl"
                        >
                            <Menu size={20} />
                        </button>
                    </div>
                )}

                <div className="max-w-7xl mx-auto content-gutter">
                    {children}
                </div>
            </main>
        </div>
    )
}
