import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { orgApi } from '../services/api'
import { orgFields, profileFields } from '../services/org'

const control = 'bg-[var(--surface-3)] text-[var(--text-primary)] text-xs font-bold px-3 py-2 rounded-xl border border-[var(--border-strong)] focus:outline-none focus:border-[var(--accent-purple)] disabled:opacity-60'

/**
 * A super admin fixing the three things the exported DTR's header asks for —
 * department, position and the day someone started — without leaving the person's
 * DTR. It writes exactly what Calendar → Setup → People writes: a department
 * change goes through orgFields() so a manager's or director's derived scope
 * (managedDepartmentIds, which the security rules read) is recomputed with it.
 *
 *   person       the selected user
 *   departments  [{ id, name }]
 *   onSaved      (patch) => void — the fields that are now true, to merge into the screen
 */
export default function PersonProfileEditor({ person, departments, onSaved }) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const save = async (write, patch) => {
        setBusy(true); setError('')
        const res = await write()
        if (res.success) onSaved(patch)
        else setError(res.message || 'Could not save that.')
        setBusy(false)
    }

    const setDepartment = (departmentId) => {
        const input = {
            departmentId,
            isManager: person.isManager === true,
            isDirector: person.isDirector === true,
            directorDepartmentIds: person.directorDepartmentIds || [],
        }
        save(() => orgApi.setUserOrg(person.id, input), orgFields(input))
    }

    const setProfile = (change) => {
        const input = { position: person.position || '', employmentDate: person.employmentDate || '', ...change }
        save(() => orgApi.setUserProfile(person.id, input), profileFields(input))
    }

    return (
        <div className="mt-3">
            <div className="flex flex-wrap items-end gap-3">
                <label className="block">
                    <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider block mb-1">Department</span>
                    <select
                        aria-label={`Department for ${person.name || person.email}`}
                        className={`${control} min-w-[12rem]`}
                        value={person.departmentId || ''}
                        disabled={busy}
                        onChange={(e) => setDepartment(e.target.value)}
                    >
                        <option value="">— None —</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                </label>

                <label className="block">
                    <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider block mb-1">Position</span>
                    <input
                        key={`pos-${person.id}-${person.position || ''}`}
                        type="text"
                        maxLength={80}
                        defaultValue={person.position || ''}
                        aria-label={`Position for ${person.name || person.email}`}
                        placeholder="e.g. Designer"
                        disabled={busy}
                        onBlur={(e) => { if (e.target.value.trim() !== (person.position || '')) setProfile({ position: e.target.value }) }}
                        className={`${control} w-48`}
                    />
                </label>

                <label className="block">
                    <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider block mb-1">Employed since</span>
                    <input
                        type="date"
                        value={person.employmentDate || ''}
                        aria-label={`Employment date for ${person.name || person.email}`}
                        disabled={busy}
                        onChange={(e) => setProfile({ employmentDate: e.target.value })}
                        className={`${control} w-44`}
                    />
                </label>

                {busy && <Loader2 size={16} className="animate-spin text-[var(--accent-purple)] mb-2" aria-label="Saving" />}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-1.5">These fill the header of the exported DTR.</p>
            {error && <p role="alert" className="text-xs text-[var(--accent-red)] mt-1">{error}</p>}
        </div>
    )
}
