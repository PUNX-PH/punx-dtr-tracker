import { useState, useEffect } from 'react'
import { Sun, Moon } from 'lucide-react'

export default function ThemeToggle() {
    const [darkMode, setDarkMode] = useState(false)

    useEffect(() => {
        // Reflect whatever index.html's pre-paint script already decided
        // (stored preference, or system preference as a fallback).
        setDarkMode(document.documentElement.classList.contains('dark'))
    }, [])

    const toggleTheme = () => {
        if (darkMode) {
            document.documentElement.classList.remove('dark')
            localStorage.theme = 'light'
            setDarkMode(false)
        } else {
            document.documentElement.classList.add('dark')
            localStorage.theme = 'dark'
            setDarkMode(true)
        }
    }

    return (
        <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-[var(--text-secondary)] bg-[var(--surface-3)] hover:bg-[var(--surface-3-hover)] rounded-xl transition-colors mb-2"
        >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            {darkMode ? 'Light Mode' : 'Dark Mode'}
        </button>
    )
}
