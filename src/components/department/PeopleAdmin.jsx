import { useMemo, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { orgApi } from '../../services/api'
import { orgTitle } from '../../services/org'

const selectClass = 'bg-[var(--surface-3)] text-[var(--text-primary)] text-sm px-2 py-1.5 rounded-lg border border-[var(--border-strong)] focus:outline-none focus:border-[var(--accent-purple)]'

/**
 * Place everyone in the org in one table: department, manager, director (and
 * which departments a director covers). Each change saves as it is made. What
 * gets written is orgFields(): the flags AND the derived managedDepartmentIds
 * the security rules read, so the two cannot disagree.
 */
export default function PeopleAdmin({ users, departments, onChanged }) {
    const [search, setSearch] = useState('')
    const [deptFilter, setDeptFilter] = useState('') // '' all, '__none' unassigned
    const [saving, setSaving] = useState(null)       // user id being saved
    const [error, setError] = useState('')

    const people = useMemo(() => {
        const q = search.trim().toLowerCase()
        return users
            .filter(u => !u.removed)
            .filter(u => deptFilter === '' || (deptFilter === '__none' ? !u.departmentId : u.departmentId === deptFilter))
            .filter(u => !q || (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    }, [users, search, deptFilter])

    const unassigned = users.filter(u => !u.removed && !u.departmentId).length

    const change = async (user, patch) => {
        setSaving(user.id); setError('')
        const next = {
            departmentId: user.departmentId || '',
            isManager: user.isManager === true,
            isDirector: user.isDirector === true,
            directorDepartmentIds: user.directorDepartmentIds || [],
            ...patch,
        }
        const res = await orgApi.setUserOrg(user.id, next)
        if (res.success) await onChanged()
        else setError(`Could not update ${user.name || 'that person'}: ${res.message}`)
        setSaving(null)
    }

    const toggleDirectorDept = (user, deptId) => {
        const cur = user.directorDepartmentIds || []
        change(user, { directorDepartmentIds: cur.includes(deptId) ? cur.filter(i => i !== deptId) : [...cur, deptId] })
    }

    return (
        <section className="bg-[var(--surface-1)] border border-[var(--border)] rounded-3xl p-4 sm:p-6 space-y-4">
            <div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">People</h3>
                <p className="text-xs text-[var(--text-muted)]">
                    A <strong>manager</strong> sees their own department. A <strong>director</strong> sees the departments you tick for them.
                    {unassigned > 0 && <> <span className="text-[var(--accent-amber)] font-semibold">{unassigned} {unassigned === 1 ? 'person has' : 'people have'} no department yet.</span></>}
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people" aria-label="Search people" className={`${selectClass} pl-9 w-48`} />
                </div>
                <select aria-label="Filter by department" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className={selectClass}>
                    <option value="">Everyone</option>
                    <option value="__none">No department</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
            </div>

            {error && <p role="alert" className="text-sm text-[var(--accent-red)]">{error}</p>}

            {departments.length === 0 && (
                <p className="text-sm text-[var(--accent-amber)]">Add a department first — then you can place people in it.</p>
            )}

            <div className="relative overflow-x-auto">
                <table className="w-full text-sm">
                    <caption className="sr-only">Department, manager and director for each person</caption>
                    <thead>
                        <tr className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border)]">
                            <th scope="col" className="text-left px-2 py-3">Person</th>
                            <th scope="col" className="text-left px-2 py-3">Department</th>
                            <th scope="col" className="px-2 py-3 text-center">Manager</th>
                            <th scope="col" className="px-2 py-3 text-center">Director</th>
                        </tr>
                    </thead>
                    <tbody>
                        {people.map(u => (
                            <tr key={u.id} className="border-b border-[var(--border)] align-top">
                                <td className="px-2 py-3">
                                    <span className="block font-semibold text-[var(--text-primary)] truncate max-w-[14rem]">{u.name || u.email}</span>
                                    <span className="block text-[10px] text-[var(--text-muted)] truncate max-w-[14rem]">{orgTitle(u) || u.email}</span>
                                </td>
                                <td className="px-2 py-3">
                                    <select
                                        aria-label={`Department for ${u.name || u.email}`}
                                        value={u.departmentId || ''}
                                        disabled={saving === u.id}
                                        onChange={(e) => change(u, { departmentId: e.target.value })}
                                        className={`${selectClass} min-w-[10rem]`}
                                    >
                                        <option value="">— None —</option>
                                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </td>
                                <td className="px-2 py-3 text-center">
                                    <input
                                        type="checkbox"
                                        aria-label={`${u.name || u.email} is a manager`}
                                        checked={u.isManager === true}
                                        disabled={saving === u.id || !u.departmentId}
                                        title={u.departmentId ? '' : 'Give them a department first — a manager manages their own'}
                                        onChange={(e) => change(u, { isManager: e.target.checked })}
                                        className="w-4 h-4 accent-[var(--accent-purple)]"
                                    />
                                </td>
                                <td className="px-2 py-3">
                                    <div className="flex flex-col items-center gap-2">
                                        <input
                                            type="checkbox"
                                            aria-label={`${u.name || u.email} is a director`}
                                            checked={u.isDirector === true}
                                            disabled={saving === u.id}
                                            onChange={(e) => change(u, { isDirector: e.target.checked })}
                                            className="w-4 h-4 accent-[var(--accent-purple)]"
                                        />
                                        {u.isDirector === true && (
                                            <fieldset className="text-left space-y-1">
                                                <legend className="sr-only">Departments {u.name} directs</legend>
                                                {departments.map(d => (
                                                    <label key={d.id} className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                                                        <input
                                                            type="checkbox"
                                                            checked={(u.directorDepartmentIds || []).includes(d.id)}
                                                            disabled={saving === u.id}
                                                            onChange={() => toggleDirectorDept(u, d.id)}
                                                            className="w-3.5 h-3.5 accent-[var(--accent-purple)]"
                                                        />
                                                        {d.name}
                                                    </label>
                                                ))}
                                                {(u.directorDepartmentIds || []).length === 0 && (
                                                    <span className="block text-[10px] text-[var(--accent-amber)]">Tick the departments they direct.</span>
                                                )}
                                            </fieldset>
                                        )}
                                        {saving === u.id && <Loader2 size={12} className="animate-spin text-[var(--accent-purple)]" />}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {people.length === 0 && <p className="text-sm text-[var(--text-muted)] text-center py-8">No one matches.</p>}
            </div>
        </section>
    )
}
