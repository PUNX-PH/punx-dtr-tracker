import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'

export default function History({ history }) {
    if (!history || history.length === 0) {
        return (
            <div className="text-center py-8 text-[var(--text-secondary)] bg-[var(--surface-1)] rounded-lg border border-[var(--border-strong)] transition-colors">
                No logs for today yet.
            </div>
        )
    }

    return (
        <div className="bg-[var(--surface-1)] rounded-xl shadow-sm border border-[var(--border-strong)] overflow-hidden transition-colors">
            <div className="bg-[var(--surface-2)] px-4 py-3 border-b border-[var(--border-strong)]">
                <h3 className="font-semibold text-[var(--text-secondary)]">Today's Activity</h3>
            </div>
            <ul className="divide-y divide-[var(--border-strong)]">
                {history.map((log) => {
                    const isTimeIn = log.type === 'IN';
                    return (
                        <li key={log.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-full ${isTimeIn ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                                    {isTimeIn ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                                </div>
                                <div>
                                    <p className={`font-medium ${isTimeIn ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                                        {isTimeIn ? 'Time In' : 'Time Out'}
                                    </p>
                                    <p className="text-xs text-[var(--text-muted)]">
                                        {new Date(log.timestamp).toLocaleDateString('en-GB')}
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-lg font-mono font-semibold text-[var(--text-secondary)]">
                                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}
