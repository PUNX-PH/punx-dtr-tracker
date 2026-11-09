import { useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { orgApi } from '../../services/api'
import { inputClass } from '../leave/shared'

/**
 * The department list HR maintains. Names are unique ignoring case, and a
 * department can't be deleted while anyone is in it (or directs it) — deleting
 * it would silently strand them with no department and no manager.
 */
export default function DepartmentsAdmin({ departments, users, onChanged }) {
    const [name, setName] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [editing, setEditing] = useState(null) // { id, name }

    const members = (id) => users.filter(u => !u.removed && u.departmentId === id).length

    const run = async (fn) => {
        setBusy(true); setError('')
        try {
            const res = await fn()
            if (!res.success) setError(res.message)
            else await onChanged()
            return res.success
        } finally { setBusy(false) }
    }

    const add = async (e) => {
        e.preventDefault()
        if (await run(() => orgApi.saveDepartment(null, name, departments))) setName('')
    }

    const saveEdit = async () => {
        if (await run(() => orgApi.saveDepartment(editing.id, editing.name, departments))) setEditing(null)
    }

    const remove = async (d) => {
        if (!window.confirm(`Delete the ${d.name} department?`)) return
        await run(() => orgApi.deleteDepartment(d.id, users))
    }

    return (
        <section className="bg-[var(--surface-1)] border border-[var(--border)] rounded-3xl p-4 sm:p-6 space-y-4">
            <div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">Departments</h3>
                <p className="text-xs text-[var(--text-muted)]">Everyone belongs to one department. Managers see their own; directors see the ones you give them.</p>
            </div>

            <form onSubmit={add} className="flex gap-2">
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="New department name"
                    aria-label="New department name"
                    maxLength={60}
                    className={inputClass}
                />
                <button disabled={busy || !name.trim()} className="flex items-center gap-1.5 px-4 py-2 bg-[var(--accent-purple)] hover:bg-[var(--accent-purple-hover)] text-white text-xs font-bold rounded-lg disabled:opacity-50 shrink-0">
                    <Plus size={14} /> Add
                </button>
            </form>

            {error && <p role="alert" className="text-sm text-[var(--accent-red)]">{error}</p>}

            {departments.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] py-6 text-center">No departments yet. Add the first one above.</p>
            ) : (
                <ul className="divide-y divide-[var(--border)]">
                    {departments.map(d => (
                        <li key={d.id} className="flex items-center gap-3 py-3">
                            {editing?.id === d.id ? (
                                <>
                                    <input
                                        autoFocus
                                        value={editing.name}
                                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null) }}
                                        aria-label={`Rename ${d.name}`}
                                        maxLength={60}
                                        className={inputClass}
                                    />
                                    <button onClick={saveEdit} disabled={busy} aria-label="Save name" className="p-2 rounded-lg text-[var(--accent-green)] hover:bg-[var(--surface-3)]"><Check size={16} /></button>
                                    <button onClick={() => setEditing(null)} aria-label="Cancel" className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-3)]"><X size={16} /></button>
                                </>
                            ) : (
                                <>
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-sm font-semibold text-[var(--text-primary)] truncate">{d.name}</span>
                                        <span className="block text-[10px] text-[var(--text-muted)]">{members(d.id)} {members(d.id) === 1 ? 'person' : 'people'}</span>
                                    </span>
                                    <button onClick={() => setEditing({ id: d.id, name: d.name })} aria-label={`Rename ${d.name}`} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)]"><Pencil size={14} /></button>
                                    <button onClick={() => remove(d)} aria-label={`Delete ${d.name}`} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-red)] hover:bg-[var(--surface-3)]"><Trash2 size={14} /></button>
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}
