import { LayoutDashboard, FileSpreadsheet, LogOut, Settings, Users, UserCheck, ChevronLeft, Send } from 'lucide-react'
import ThemeToggle from './ThemeToggle'

export default function Sidebar({ activeTab, onTabChange, onLogout, user, onClose }) {
    const canSeeSenior = user.isSenior || user.role === 'super_admin'

    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },

        { id: 'admin', label: 'Admin Dashboard', icon: Users, disabled: !['admin', 'super_admin'].includes(user.role) },

        ...(canSeeSenior ? [{ id: 'senior', label: 'Senior Dashboard', icon: UserCheck }] : []),
    ]

    return (
        <div className="w-64 h-screen bg-[var(--surface-1)] border-r border-[var(--border)] flex flex-col flex-shrink-0 relative group">
            {/* Logo Area */}
            <div className="p-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tighter text-[var(--text-primary)]">
                        PUNX
                    </h1>
                    <p className="text-[var(--text-muted)] text-xs text-[10px] font-medium tracking-widest mt-1">DTR TRACKER</p>
                </div>
                {/* Desktop Close Button (Visible when parent is open, which it is if we are here) */}
                {/* We only want this on desktop usually, but logic is handled by layout visibility */}
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] hidden md:block transition-colors"
                        title="Collapse Menu"
                    >
                        <ChevronLeft size={20} />
                    </button>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 space-y-1 mt-6">
                {menuItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => !item.disabled && onTabChange(item.id)}
                        disabled={item.disabled}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 group
              ${activeTab === item.id
                                ? 'bg-[var(--accent-purple)]/10 text-[var(--accent-purple)]'
                                : item.disabled
                                    ? 'text-[var(--text-muted)]/50 cursor-not-allowed'
                                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-3)]'
                            }`}
                    >
                        <item.icon size={20} className={activeTab === item.id ? 'text-[var(--accent-purple)]' : item.disabled ? 'text-[var(--text-muted)]/40' : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'} />
                        {item.label}
                    </button>
                ))}
            </nav>

            {/* Footer / User Profile */}
            <div className="p-4 border-t border-[var(--border)]">
                <div className="flex items-center gap-3 mb-4 px-2">
                    <div className="w-10 h-10 rounded-full bg-[var(--accent-purple)] flex items-center justify-center text-white font-bold">
                        {user.name.charAt(0)}
                    </div>
                    <div className="overflow-hidden">
                        <p className="text-sm font-medium text-[var(--text-primary)] truncate">{user.name}</p>
                        <div className="flex items-center gap-2" title="Click to Copy ID">
                            <p
                                className="text-xs text-[var(--text-muted)] truncate cursor-pointer hover:text-[var(--text-primary)] transition-colors"
                                onClick={() => {
                                    navigator.clipboard.writeText(user.id);
                                    alert("User ID copied: " + user.id);
                                }}
                            >
                                ID: {user.id.substring(0, 6)}...
                            </p>
                            {user.role === 'admin' && (
                                <span className="text-[10px] bg-[var(--accent-red)]/10 text-[var(--accent-red)] px-1.5 py-0.5 rounded font-bold uppercase">ADMIN</span>
                            )}
                            {user.role === 'super_admin' && (
                                <span className="text-[10px] bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] px-1.5 py-0.5 rounded font-bold uppercase">S.ADM</span>
                            )}
                        </div>
                    </div>
                </div>

                <ThemeToggle />

                <button
                    id="sidebar-send-btn"
                    onClick={() => {
                        if (activeTab !== 'dashboard') {
                            onTabChange('dashboard');
                            setTimeout(() => document.getElementById('hidden-submit-dtr-btn')?.click(), 100);
                        } else {
                            document.getElementById('hidden-submit-dtr-btn')?.click();
                        }
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-[var(--accent-purple)] hover:bg-[var(--accent-purple-hover)] rounded-xl transition-colors mb-2 shadow-lg shadow-purple-900/20 disabled:scale-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Send size={18} />
                    Send to Admin
                </button>

                <button
                    onClick={onLogout}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-[var(--accent-red)] bg-[var(--accent-red)]/10 hover:bg-[var(--accent-red)]/20 rounded-xl transition-colors"
                >
                    <LogOut size={18} />
                    Sign Out
                </button>
            </div>
        </div>
    )
}
