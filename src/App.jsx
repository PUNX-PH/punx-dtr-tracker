import { useState, useEffect } from 'react'
import { auth } from './firebase'
import { onAuthStateChanged } from 'firebase/auth'
import Login from './components/Login'
import Dashboard from './components/Dashboard'

import Layout from './components/Layout'
import AdminDashboard from './components/AdminDashboard'
import SeniorDashboard from './components/SeniorDashboard'

function App() {
    const [user, setUser] = useState(null)
    const [activeTab, setActiveTab] = useState('dashboard')
    const [loading, setLoading] = useState(true)
    const [notificationFocus, setNotificationFocus] = useState(null) // { employeeId, cutoffId }

    useEffect(() => {
        // Listen for Firebase Auth changes (Persistence)
        // Listen for Firebase Auth changes (Persistence)
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                // Domain Security Check
                if (!firebaseUser.email.endsWith('@punx.ai') && firebaseUser.email.toLowerCase() !== 'perezjohnrey43@gmail.com') {
                    console.warn(`Unauthorized access attempt: ${firebaseUser.email}`)
                    await auth.signOut()
                    setUser(null)
                    setLoading(false)
                    return
                }

                // Fetch or Create user profile in Firestore
                const { api } = await import('./services/api');
                const profile = await api.ensureUserProfile(firebaseUser);

                // Merge Auth data with Firestore data
                setUser({
                    id: firebaseUser.uid,
                    name: firebaseUser.displayName,
                    email: firebaseUser.email,
                    photoURL: firebaseUser.photoURL,
                    role: profile?.role || 'employee',
                    isSenior: profile?.isSenior === true
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

    const handleNotificationNavigate = (focus) => {
        if (!user || !focus?.employeeId) return
        const targetTab = ['admin', 'super_admin'].includes(user.role)
            ? 'admin'
            : (user.isSenior ? 'senior' : null)
        if (!targetTab) return
        setActiveTab(targetTab)
        setNotificationFocus(focus)
    }

    if (loading) {
        return (
            <div className="min-h-[100dvh] bg-[var(--surface-0)] flex items-center justify-center">
                {/* Simple CSS Spinner */}
                <div className="w-12 h-12 border-4 border-[var(--border)] border-t-[var(--accent-purple)] rounded-full animate-spin"></div>
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
                    onNotificationNavigate={handleNotificationNavigate}
                >
                    {activeTab === 'dashboard' && <Dashboard user={user} />}

                    {activeTab === 'admin' && ['admin', 'super_admin'].includes(user.role) && (
                        <AdminDashboard
                            currentUser={user}
                            focusRequest={notificationFocus}
                            onFocusHandled={() => setNotificationFocus(null)}
                        />
                    )}

                    {activeTab === 'senior' && (user.isSenior || user.role === 'super_admin') && (
                        <SeniorDashboard
                            currentUser={user}
                            focusRequest={notificationFocus}
                            onFocusHandled={() => setNotificationFocus(null)}
                        />
                    )}
                </Layout>
            ) : (
                <div className="min-h-[100dvh] bg-[var(--surface-0)] flex flex-col items-center justify-center safe-inset">
                    <Login onLogin={handleLogin} />
                </div>
            )}
        </>
    )
}

export default App
