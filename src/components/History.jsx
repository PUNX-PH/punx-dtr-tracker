import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'

export default function History({ history }) {
    if (!history || history.length === 0) {
        return (
            <div className="text-center py-8 text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 transition-colors">
                No logs for today yet.
            </div>
        )
    }

    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors">
            <div className="bg-slate-50 dark:bg-slate-900 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                <h3 className="font-semibold text-slate-700 dark:text-slate-300">Today's Activity</h3>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
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
                                    <p className="text-xs text-slate-400 dark:text-slate-500">
                                        {new Date(log.timestamp).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-lg font-mono font-semibold text-slate-700 dark:text-slate-300">
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
