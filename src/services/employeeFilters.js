// Filtering the Admin Dashboard's Employees list. Pure, so the rules live in
// one tested place (tests/employeeFilters.test.mjs) instead of inside the screen.
//
// Three things narrow the list, and they combine (all must match):
//   • search  — name or email
//   • senior  — 'all' | 'none' (nobody assigned) | a senior's user id
//   • status  — where that person's DTR is for the cutoff on screen:
//       notsent   no DTR sent for this cutoff
//       waiting   sent, not decided yet — the amber bar; this is the one a senior
//                 still has to approve
//       approved  the green bar
//       rejected  sent back to be fixed and resent

export const DTR_STATES = ['notsent', 'waiting', 'approved', 'rejected']

/** Where one person's DTR stands, from their submission for the cutoff (or undefined). */
export function dtrState(submission) {
    if (!submission) return 'notsent'
    if (submission.status === 'approved') return 'approved'
    if (submission.status === 'rejected') return 'rejected'
    return 'waiting'
}

const byName = (a, b) => (a.name || '').localeCompare(b.name || '')

/** Everyone matching the search and the senior filter — i.e. before the status filter. */
export function narrowEmployees(users, { search = '', senior = 'all' } = {}) {
    const q = search.trim().toLowerCase()
    return users
        .filter(u => !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
        .filter(u => senior === 'all' || (senior === 'none' ? !u.assignedSeniorId : u.assignedSeniorId === senior))
}

/** { all, notsent, waiting, approved, rejected } for a list — what the filter chips show. */
export function countByState(list, submissions = {}) {
    const counts = { all: list.length, notsent: 0, waiting: 0, approved: 0, rejected: 0 }
    for (const u of list) counts[dtrState(submissions[u.id])]++
    return counts
}

/** The status filter applied to a narrowed list, sorted by name. */
export function applyStatus(list, status, submissions = {}) {
    const out = status === 'all' ? list : list.filter(u => dtrState(submissions[u.id]) === status)
    return [...out].sort(byName)
}

/**
 * The people worth offering in the "assigned senior" dropdown: everyone flagged
 * as a senior, plus anyone who is actually assigned to someone (so a person whose
 * senior lost the flag can still be found). Each carries how many employees they
 * are assigned. Current (not removed) people only.
 */
export function seniorOptions(users) {
    const current = users.filter(u => !u.removed)
    const assigned = {}
    for (const u of current) if (u.assignedSeniorId) assigned[u.assignedSeniorId] = (assigned[u.assignedSeniorId] || 0) + 1
    const ids = new Set([...current.filter(u => u.isSenior).map(u => u.id), ...Object.keys(assigned)])
    return current
        .filter(u => ids.has(u.id))
        .map(u => ({ id: u.id, name: u.name || u.email || 'Unknown', count: assigned[u.id] || 0 }))
        .sort((a, b) => a.name.localeCompare(b.name))
}
