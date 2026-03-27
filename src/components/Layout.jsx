import { useState, useEffect } from 'react'
import { Menu, X } from 'lucide-react'
import Sidebar from './Sidebar'
import NotificationToast from './NotificationToast'
import { api } from '../services/api'

export default function Layout({ children, user, onLogout, activeTab, onTabChange }) {
    const [isSidebarOpen, setSidebarOpen] = useState(true)
    const [isMobile, setIsMobile] = useState(false)
    const [notification, setNotification] = useState(null)

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
            // Filter for unread and pick the latest one
            // In a real app we might show a list or queue, here we show the latest unread pop-up
            const unread = notifs.filter(n => !n.read);
            if (unread.length > 0) {
                // Play notification sound?
                setNotification(unread[0]);
            } else {
                setNotification(null);
            }
        });

        return () => unsubscribe();
    }, [user]);

    const handleDismiss = async (id) => {
        setNotification(null);
        await api.markNotificationRead(id);
    }

    const handleApprove = async (notif) => {
        await api.updateOTStatus(notif.data.submissionId, 'approved');
        handleDismiss(notif.id);
        alert(`OT Approved for ${notif.data.employeeName}`);
    }

    const handleDecline = async (notif) => {
        await api.updateOTStatus(notif.data.submissionId, 'declined');
        handleDismiss(notif.id);
        alert(`OT Declined for ${notif.data.employeeName}`);
    }

    return (
        <div className="flex h-screen bg-[#0f0f12] overflow-hidden relative">
            {/* Notification Toast */}
            {notification && (
                <NotificationToast
                    notification={notification}
                    onDismiss={handleDismiss}
                    onApprove={handleApprove}
                    onDecline={handleDecline}
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
                fixed md:relative z-50 h-full
                transition-all duration-300 ease-in-out
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-0 md:overflow-hidden'}
            `}>
                <div className="h-full relative">
                    {/* Close Button for Mobile */}
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="md:hidden absolute top-4 right-4 text-slate-500 hover:text-white z-50"
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
                {/* Header / Toggle Area */}
                <div className="p-4 md:hidden">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="p-2 bg-[#141419] border border-[#1f1f23] rounded-xl text-white hover:bg-[#1f1f23] transition-colors"
                    >
                        <Menu size={24} />
                    </button>
                </div>

                {/* Toggle Button for Desktop (Optional, if user wants to hide sidebar on desktop too) */}
                {!isMobile && !isSidebarOpen && (
                    <div className="absolute top-8 left-8 z-30">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="p-3 bg-[#141419] border border-[#1f1f23] rounded-xl text-white hover:bg-[#1f1f23] transition-colors shadow-xl"
                        >
                            <Menu size={20} />
                        </button>
                    </div>
                )}

                <div className="max-w-7xl mx-auto p-4 md:p-8">
                    {children}
                </div>
            </main>
        </div>
    )
}
