import { useState, useEffect } from 'react'
import { auth } from './firebase'
import { onAuthStateChanged } from 'firebase/auth'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import ExcelViewer from './components/ExcelViewer'
import Layout from './components/Layout'
import AdminDashboard from './components/AdminDashboard'

function App() {
    const [user, setUser] = useState(null)
    const [activeTab, setActiveTab] = useState('dashboard')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        // Listen for Firebase Auth changes (Persistence)
        // Listen for Firebase Auth changes (Persistence)
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                // Fetch or Create user profile in Firestore
                const { api } = await import('./services/api');
                const profile = await api.ensureUserProfile(firebaseUser);

                // Merge Auth data with Firestore data
                setUser({
                    id: firebaseUser.uid,
                    name: firebaseUser.displayName,
                    email: firebaseUser.email,
                    photoURL: firebaseUser.photoURL,
                    role: profile?.role || 'employee'
                })
            } else {
                setUser(null)
            }
            setLoading(false)
        })

        return () => unsubscribe()
    }, [])

    const handleLogin = async (userData) => {
        // Fetch/Create role just in case direct login happens
        const { api } = await import('./services/api');
        // We need the full firebaseUser object here, but Login usually passes simplified data.
        // Ideally Login passes the UserCredential.user. 
        // But since onAuthStateChanged triggers anyway, this might be redundant or race-condition prone?
        // Let's rely on onAuthStateChanged mostly, but for immediate UI feedback:

        // Note: userData from Login might be incomplete for ensureUserProfile if it expects a Firebase User object.
        // Let's assume onAuthStateChanged catches it. 
        // Only set basics here for immediate responsiveness, let effect sync role.
        setUser(userData)
    }

    const handleLogout = async () => {
        await auth.signOut() // Sign out from Firebase
        setUser(null)
        setActiveTab('dashboard')
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0f0f12] flex items-center justify-center">
                {/* Simple CSS Spinner */}
                <div className="w-12 h-12 border-4 border-[#1f1f23] border-t-[#8b5cf6] rounded-full animate-spin"></div>
            </div>
        )
    }

    return (
        <>
            {user ? (
                <Layout
                    user={user}
                    onLogout={handleLogout}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                >
                    {activeTab === 'dashboard' && <Dashboard user={user} />}
                    {activeTab === 'excel' && (
                        <div className="h-full bg-white dark:bg-[#141419] rounded-3xl overflow-hidden border border-[#1f1f23]">
                            <ExcelViewer isOpen={true} onClose={() => setActiveTab('dashboard')} />
                        </div>
                    )}
                    {activeTab === 'admin' && user.role === 'admin' && (
                        <AdminDashboard currentUser={user} />
                    )}
                </Layout>
            ) : (
                <div className="min-h-screen bg-[#0f0f12] flex flex-col items-center justify-center p-4">
                    <Login onLogin={handleLogin} />
                </div>
            )}
        </>
    )
}

export default App
