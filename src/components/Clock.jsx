import { useState, useEffect } from 'react'

export default function Clock() {
    const [date, setDate] = useState(new Date())

    useEffect(() => {
        const timer = setInterval(() => setDate(new Date()), 1000)
        return () => clearInterval(timer)
    }, [])

    return (
        <div className="text-center p-4">
            <div className="text-4xl md:text-5xl font-mono font-bold text-slate-800 dark:text-white tracking-wider">
                {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-slate-500 dark:text-slate-400 font-medium mt-1 text-lg">
                {date.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
        </div>
    )
}
