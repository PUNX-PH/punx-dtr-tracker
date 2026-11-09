// Departments and who can see whom. Pure — the same functions answer "which
// employees can this person see?" for the calendar, attendance and leave
// history, so the screens cannot drift apart. The Firestore rules enforce the
// same thing on the server (see `managedDepts` in firestore.rules); this is the
// UI's mirror of it, not the lock.
//
// THE MODEL
//   users/{id}.departmentId           the one department a person belongs to
//   users/{id}.isManager              manages their OWN department
//   users/{id}.isDirector             manages the departments in directorDepartmentIds
//   users/{id}.directorDepartmentIds  [deptId, ...]
//   users/{id}.managedDepartmentIds   DERIVED from the three above (deriveManaged)
//                                     and stored, because the rules read this one
//                                     field instead of re-deriving it per request.
// HR / Admin (role admin, super_admin) are not tied to a department: company-wide.

export const NO_DEPARTMENT = ''

const unique = (arr) => [...new Set(arr.filter(Boolean))]

/**
 * The departments someone manages, from their flags. A manager covers their own
 * department; a director covers the ones listed for them (a director with no
 * list manages nothing — it must be set on purpose).
 */
export function deriveManaged({ departmentId, isManager, isDirector, directorDepartmentIds } = {}) {
    return unique([
        ...(isManager === true && departmentId ? [departmentId] : []),
        ...(isDirector === true && Array.isArray(directorDepartmentIds) ? directorDepartmentIds : []),
    ])
}

export const isHrOrAdmin = (user) => ['admin', 'super_admin'].includes(user?.role)

/**
 * What a person may see across the company:
 *   { all: true }                 HR / Admin
 *   { departmentIds: [..] }       managers and directors, their departments only
 *   { none: true }                everyone else (they see their own record only)
 */
export function scopeFor(user) {
    if (isHrOrAdmin(user)) return { all: true, departmentIds: [] }
    const ids = unique(Array.isArray(user?.managedDepartmentIds) ? user.managedDepartmentIds : [])
    return ids.length > 0 ? { all: false, departmentIds: ids } : { all: false, departmentIds: [], none: true }
}

export const hasScope = (scope) => scope.all === true || scope.departmentIds.length > 0

/** May this scope see someone in `departmentId`? A person with no department is HR-only. */
export const inScope = (scope, departmentId) =>
    scope.all === true || (!!departmentId && scope.departmentIds.includes(departmentId))

/** The people a scope covers, minus anyone who has left. */
export const usersInScope = (scope, users) =>
    users.filter(u => !u.removed && inScope(scope, u.departmentId))

export const departmentName = (departments, id) =>
    departments.find(d => d.id === id)?.name || (id ? 'Unknown department' : 'No department')

/** The departments a scope can pick between, for a filter dropdown. */
export const departmentsInScope = (scope, departments) =>
    scope.all ? departments : departments.filter(d => scope.departmentIds.includes(d.id))

/** The fields to write when HR edits someone's place in the org. */
export function orgFields({ departmentId = '', isManager = false, isDirector = false, directorDepartmentIds = [] }) {
    const dirIds = isDirector ? unique(directorDepartmentIds) : []
    return {
        departmentId,
        isManager: isManager === true,
        isDirector: isDirector === true,
        directorDepartmentIds: dirIds,
        managedDepartmentIds: deriveManaged({ departmentId, isManager, isDirector, directorDepartmentIds: dirIds }),
    }
}

/** "Manager", "Director", "Manager · Director" — or '' for everyone else. */
export function orgTitle(user) {
    return [user?.isManager === true && 'Manager', user?.isDirector === true && 'Director'].filter(Boolean).join(' · ')
}
