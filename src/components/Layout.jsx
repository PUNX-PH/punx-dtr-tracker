import Sidebar from './Sidebar'

export default function Layout({ children, user, onLogout, activeTab, onTabChange }) {
    return (
        <div className="flex h-screen bg-[#0f0f12] overflow-hidden">
            <Sidebar
                user={user}
                onLogout={onLogout}
                activeTab={activeTab}
                onTabChange={onTabChange}
            />

            <main className="flex-1 overflow-auto relative">
                <div className="max-w-7xl mx-auto p-8">
                    {children}
                </div>
            </main>
        </div>
    )
}
