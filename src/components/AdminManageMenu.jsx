import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Settings2 } from 'lucide-react'

/**
 * The role actions for the selected person, folded into one menu so they stop
 * taking a row of their own: promote / demote, and Senior on/off. The rules
 * about who may do what are unchanged — this only decides which items appear:
 *   employee     → Promote to Admin
 *   admin        → Promote to Super Admin (super admins only), Demote to Employee
 *   super admin  → Demote to Admin
 *   anyone       → Make / Remove Senior
 */
export default function AdminManageMenu({ selectedUser, currentUser, onRole, onToggleSenior }) {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)

    useEffect(() => {
        if (!open) return
        const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
        document.addEventListener('mousedown', onDown)
        window.addEventListener('keydown', onKey)
        return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
    }, [open])

    const items = []
    if (selectedUser.role === 'employee') items.push({ label: 'Promote to Admin', tone: 'red', run: () => onRole('admin') })
    if (selectedUser.role === 'admin') {
        if (currentUser.role === 'super_admin') items.push({ label: 'Promote to Super Admin', tone: 'purple', run: () => onRole('super_admin') })
        items.push({ label: 'Demote to Employee', run: () => onRole('employee') })
    }
    if (selectedUser.role === 'super_admin') items.push({ label: 'Demote to Admin', run: () => onRole('admin') })
    items.push({ label: selectedUser.isSenior ? 'Remove Senior role' : 'Make Senior', tone: 'amber', run: () => onToggleSenior(!selectedUser.isSenior) })

    const tone = { red: 'text-[var(--accent-red)]', purple: 'text-[var(--accent-purple)]', amber: 'text-[var(--accent-amber)]' }

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--surface-3)] hover:bg-[var(--surface-3-hover)] text-[var(--text-primary)] border border-[var(--border-strong)] text-xs font-bold rounded-xl transition-colors"
            >
                <Settings2 size={15} /> Manage <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div role="menu" className="absolute left-0 top-full mt-2 z-30 min-w-[13rem] bg-[var(--surface-1)] border border-[var(--border-strong)] rounded-xl shadow-2xl p-1.5">
                    {items.map(it => (
                        <button
                            key={it.label}
                            role="menuitem"
                            type="button"
                            onClick={() => { setOpen(false); it.run() }}
                            className={`w-full text-left px-3 py-2 text-xs font-bold rounded-lg hover:bg-[var(--surface-3)] transition-colors ${tone[it.tone] || 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                        >
                            {it.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
