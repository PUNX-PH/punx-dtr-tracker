import { LayoutDashboard, FileSpreadsheet, LogOut, Settings, Users } from 'lucide-react'

export default function Sidebar({ activeTab, onTabChange, onLogout, user }) {
    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'excel', label: 'Excel Viewer', icon: FileSpreadsheet },
        { id: 'admin', label: 'Admin Dashboard', icon: Users, disabled: user.role !== 'admin' },
    ]

    return (
        <div className="w-64 h-screen bg-[#141419] border-r border-[#1f1f23] flex flex-col flex-shrink-0">
            {/* Logo Area */}
            <div className="p-6">
                <h1 className="text-2xl font-bold tracking-tighter text-white">
                    PUNX
                </h1>
                <p className="text-slate-500 text-xs text-[10px] font-medium tracking-widest mt-1">DTR TRACKER</p>
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
                                ? 'bg-[#8b5cf6]/10 text-[#8b5cf6]'
                                : item.disabled
                                    ? 'text-slate-700 cursor-not-allowed'
                                    : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
                            }`}
                    >
                        <item.icon size={20} className={activeTab === item.id ? 'text-[#8b5cf6]' : item.disabled ? 'text-slate-800' : 'text-slate-600 group-hover:text-slate-400'} />
                        {item.label}
                    </button>
                ))}
            </nav>

            {/* Footer / User Profile */}
            <div className="p-4 border-t border-[#1f1f23]">
                <div className="flex items-center gap-3 mb-4 px-2">
                    <div className="w-10 h-10 rounded-full bg-[#8b5cf6] flex items-center justify-center text-white font-bold">
                        {user.name.charAt(0)}
                    </div>
                    <div className="overflow-hidden">
                        <p className="text-sm font-medium text-white truncate">{user.name}</p>
                        <div className="flex items-center gap-2" title="Click to Copy ID">
                            <p
                                className="text-xs text-slate-500 truncate cursor-pointer hover:text-white transition-colors"
                                onClick={() => {
                                    navigator.clipboard.writeText(user.id);
                                    alert("User ID copied: " + user.id);
                                }}
                            >
                                ID: {user.id.substring(0, 6)}...
                            </p>
                            {user.role === 'admin' && (
                                <span className="text-[10px] bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded font-bold uppercase">ADMIN</span>
                            )}
                        </div>
                    </div>
                </div>

                <button
                    onClick={onLogout}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-red-500 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-colors"
                >
                    <LogOut size={18} />
                    Sign Out
                </button>
            </div>
        </div>
    )
}
