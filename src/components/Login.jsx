import { useState } from 'react'
import { auth, googleProvider } from '../firebase'
import { signInWithPopup } from 'firebase/auth'
import { Lock, User } from 'lucide-react'

export default function Login({ onLogin }) {
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleGoogleLogin = async () => {
        setLoading(true)
        setError('')

        try {
            googleProvider.setCustomParameters({
                prompt: 'select_account'
            })
            const result = await signInWithPopup(auth, googleProvider)
            const user = result.user
            const email = user.email

            if (!email.endsWith('@punx.ai')) {
                await auth.signOut()
                setError('Access restricted to @punx.ai emails only.')
                setLoading(false)
                return
            }

            // Success - Pass user info to parent
            // We map Google user to our app user structure
            const appUser = {
                id: user.uid,
                name: user.displayName,
                email: user.email,
                photoURL: user.photoURL
            }

            onLogin(appUser)

        } catch (err) {
            console.error(err)
            setError('Login failed. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="w-full max-w-md bg-[#141419] rounded-3xl shadow-2xl p-8 border border-[#1f1f23] animate-in fade-in zoom-in duration-500">
            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-black text-white mb-6 border border-[#1f1f23]">
                    <span className="text-2xl font-black tracking-tighter">PUNX</span>
                </div>
                <h1 className="text-3xl font-bold text-white tracking-tight">Welcome Back</h1>
                <p className="text-slate-500 mt-2">Sign in to access your dashboard</p>
            </div>

            <div className="space-y-6">
                {error && (
                    <div className="text-red-500 text-sm text-center bg-red-500/10 border border-red-500/20 p-3 rounded-xl">
                        {error}
                    </div>
                )}

                <button
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full bg-black hover:bg-slate-900 text-white border border-[#333] font-bold py-4 px-4 rounded-xl transition-all shadow-lg hover:-translate-y-0.5 flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {loading ? (
                        <span>Connecting...</span>
                    ) : (
                        <>
                            {/* Google G Logo (White version for dark btn) */}
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12.545,10.239v3.821h5.445c-0.712,2.3-2.627,3.821-5.445,3.821c-3.283,0-5.958-2.605-5.958-5.958s2.675-5.958,5.958-5.958c1.357,0,2.693,0.518,3.719,1.464L19.263,4.78C17.476,3.003,15.111,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z" />
                            </svg>
                            <span>Sign in with Google</span>
                        </>
                    )}
                </button>

                <div className="text-center">
                    <p className="text-xs text-slate-600 uppercase tracking-widest font-semibold">
                        Restricted Access
                    </p>
                    <p className="text-[10px] text-slate-700 mt-1">
                        Only <span className="text-[#8b5cf6]">@punx.ai</span> accounts allowed
                    </p>
                </div>
            </div>
        </div>
    )
}
