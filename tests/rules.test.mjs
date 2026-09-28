// firestore.rules test suite for punx-dtr.
//
// The rules replaced a wide-open `allow read, write: if request.auth != null`,
// so there are two ways to fail here and only one of them is obvious. Locking
// the database down is easy; locking out the people who run payroll is the
// expensive mistake. Every screen's reads are asserted to still SUCCEED, not
// just the attacks to fail.
//
// `@firebase/rules-unit-testing` is deliberately not a package.json dependency —
// it conflicts with the pinned firebase version. Install on demand:
//
//   npm i --no-save --legacy-peer-deps @firebase/rules-unit-testing
//   npx firebase emulators:exec --only firestore --project punx-dtr-rules-test \
//     "node tests/rules.test.mjs"
//
// Runs entirely against the local emulator; never touches live data.
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, orderBy, limit,
} from 'firebase/firestore'

const PROJECT = 'punx-dtr-rules-test'
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080').split(':')

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
})

const as = (uid) => testEnv.authenticatedContext(uid, {
  email: `${uid}@punx.ai`, email_verified: true,
}).firestore()
const anon = () => testEnv.unauthenticatedContext().firestore()

const EMP = 'emp1'
const EMP2 = 'emp2'
const SENIOR = 'senior1'
const ADMIN = 'admin1'
const OUTSIDER = 'outsider1'   // signed in, but has no DTR profile
const PLAIN_ADMIN = 'padmin1'  // role admin, not super_admin
const GONE = 'gone1'           // an employee who left and was removed
const GONE_SENIOR = 'gonesen1' // a senior who left and was removed
const LEAVER = 'leaver1'       // removed during the test run
const CUTOFF = 'cutoff1'

await testEnv.clearFirestore()
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore()
  await setDoc(doc(db, 'users', EMP), { uid: EMP, name: 'Emp', email: 'emp1@punx.ai', role: 'employee', pin: '1234' })
  await setDoc(doc(db, 'users', EMP2), { uid: EMP2, name: 'Emp2', email: 'emp2@punx.ai', role: 'employee', pin: '5678' })
  await setDoc(doc(db, 'users', SENIOR), { uid: SENIOR, name: 'Sen', email: 's@punx.ai', role: 'employee', isSenior: true })
  await setDoc(doc(db, 'users', ADMIN), { uid: ADMIN, name: 'Adm', email: 'a@punx.ai', role: 'super_admin' })
  await setDoc(doc(db, 'users', PLAIN_ADMIN), { uid: PLAIN_ADMIN, name: 'PAdm', email: 'pa@punx.ai', role: 'admin' })
  await setDoc(doc(db, 'users', GONE), { uid: GONE, name: 'Gone', email: 'g@punx.ai', role: 'employee', removed: true })
  await setDoc(doc(db, 'users', GONE_SENIOR), { uid: GONE_SENIOR, name: 'GoneS', email: 'gs@punx.ai', role: 'admin', isSenior: true, removed: true })
  await setDoc(doc(db, 'users', LEAVER), { uid: LEAVER, name: 'Leaver', email: 'l@punx.ai', role: 'employee' })
  await setDoc(doc(db, 'logs', 'log_gone'), { employeeId: GONE, type: 'IN', timestamp: new Date() })
  await setDoc(doc(db, 'submissions', `${GONE}_${CUTOFF}`), { userId: GONE, cutoffId: CUTOFF, status: 'pending' })
  await setDoc(doc(db, 'notifications', 'n_gone'), { recipientId: GONE, type: 'X', read: false, createdAt: new Date() })
  await setDoc(doc(db, 'cutoffs', CUTOFF), { startDate: new Date(), endDate: new Date(), createdAt: new Date() })
  await setDoc(doc(db, 'logs', 'log_emp'), { employeeId: EMP, type: 'IN', timestamp: new Date() })
  await setDoc(doc(db, 'logs', 'log_emp2'), { employeeId: EMP2, type: 'IN', timestamp: new Date() })
  await setDoc(doc(db, 'submissions', `${EMP}_${CUTOFF}`), { userId: EMP, cutoffId: CUTOFF, status: 'pending_senior' })
  await setDoc(doc(db, 'notifications', 'n_emp'), { recipientId: EMP, type: 'X', read: false, createdAt: new Date() })
  await setDoc(doc(db, 'notifications', 'n_emp2'), { recipientId: EMP2, type: 'X', read: false, createdAt: new Date() })
  await setDoc(doc(db, 'settings', 'dtrReminder'), { autoSendEnabled: true })
})

let pass = 0, fail = 0
async function it(name, fn) {
  try { await fn(); console.log(`  ok   ${name}`); pass++ }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message.split('\n')[0]}`); fail++ }
}

console.log('\nthe hole these rules close')
await it('an outsider with no profile cannot list users (pin harvesting)', () =>
  assertFails(getDocs(collection(as(OUTSIDER), 'users'))))
await it('an employee cannot list users either', () =>
  assertFails(getDocs(collection(as(EMP), 'users'))))
await it('an outsider cannot read anyone\'s logs', () =>
  assertFails(getDocs(collection(as(OUTSIDER), 'logs'))))
await it('an employee cannot list all logs unfiltered', () =>
  assertFails(getDocs(collection(as(EMP), 'logs'))))
await it('an employee cannot read another employee\'s log', () =>
  assertFails(getDoc(doc(as(EMP), 'logs', 'log_emp2'))))
await it('an employee cannot read another employee\'s notifications', () =>
  assertFails(getDoc(doc(as(EMP), 'notifications', 'n_emp2'))))
await it('nobody signed out gets anything', () =>
  assertFails(getDoc(doc(anon(), 'cutoffs', CUTOFF))))

console.log('\nprivilege escalation')
await it('an employee cannot make themselves super_admin', () =>
  assertFails(updateDoc(doc(as(EMP), 'users', EMP), { role: 'super_admin' })))
await it('an employee cannot make themselves a senior', () =>
  assertFails(updateDoc(doc(as(EMP), 'users', EMP), { isSenior: true })))
await it('a new account cannot self-create as super_admin', () =>
  assertFails(setDoc(doc(as(OUTSIDER), 'users', OUTSIDER), { uid: OUTSIDER, role: 'super_admin' })))
await it('a new account cannot self-create as a senior', () =>
  assertFails(setDoc(doc(as(OUTSIDER), 'users', OUTSIDER), { uid: OUTSIDER, role: 'employee', isSenior: true })))
await it('an employee cannot approve their own DTR', () =>
  assertFails(updateDoc(doc(as(EMP), 'submissions', `${EMP}_${CUTOFF}`), { status: 'approved' })))
await it('an employee cannot edit a cutoff', () =>
  assertFails(updateDoc(doc(as(EMP), 'cutoffs', CUTOFF), { submitBy: new Date() })))
await it('a senior cannot edit a cutoff either', () =>
  assertFails(updateDoc(doc(as(SENIOR), 'cutoffs', CUTOFF), { submitBy: new Date() })))
await it('the kill switch is not client-writable', () =>
  assertFails(updateDoc(doc(as(ADMIN), 'settings', 'dtrReminder'), { autoSendEnabled: false })))
await it('an unknown collection is denied', () =>
  assertFails(getDoc(doc(as(ADMIN), 'somethingNew', 'x'))))

console.log('\nthe app must still work — employee (Dashboard.jsx)')
await it('reads their own profile', () =>
  assertSucceeds(getDoc(doc(as(EMP), 'users', EMP))))
await it('reads the active cutoff', () =>
  assertSucceeds(getDocs(query(collection(as(EMP), 'cutoffs'), orderBy('createdAt', 'desc'), limit(1)))))
await it('reads their own history (filtered by employeeId)', () =>
  assertSucceeds(getDocs(query(collection(as(EMP), 'logs'), where('employeeId', '==', EMP)))))
await it('clocks in', () =>
  assertSucceeds(setDoc(doc(as(EMP), 'logs', 'new_emp_log'), { employeeId: EMP, type: 'IN', timestamp: new Date() })))
await it('edits their own log', () =>
  assertSucceeds(updateDoc(doc(as(EMP), 'logs', 'log_emp'), { timestamp: new Date() })))
await it('deletes their own log', () =>
  assertSucceeds(deleteDoc(doc(as(EMP), 'logs', 'new_emp_log'))))
await it('reads their own notifications (filtered by recipientId)', () =>
  assertSucceeds(getDocs(query(collection(as(EMP), 'notifications'), where('recipientId', '==', EMP)))))
await it('marks their notification read', () =>
  assertSucceeds(updateDoc(doc(as(EMP), 'notifications', 'n_emp'), { read: true })))
await it('reads their own submission', () =>
  assertSucceeds(getDoc(doc(as(EMP), 'submissions', `${EMP}_${CUTOFF}`))))
await it('resubmits their DTR into a pending state', () =>
  assertSucceeds(setDoc(doc(as(EMP), 'submissions', `${EMP}_${CUTOFF}`),
    { userId: EMP, cutoffId: CUTOFF, status: 'pending_senior' })))
await it('a brand-new Google account self-creates its profile', () =>
  assertSucceeds(setDoc(doc(as(OUTSIDER), 'users', OUTSIDER),
    { uid: OUTSIDER, name: 'New', email: 'outsider1@punx.ai', role: 'employee' })))

console.log('\nthe app must still work — senior (SeniorDashboard.jsx)')
await it('lists all users', () =>
  assertSucceeds(getDocs(collection(as(SENIOR), 'users'))))
await it('lists cutoffs', () =>
  assertSucceeds(getDocs(query(collection(as(SENIOR), 'cutoffs'), orderBy('createdAt', 'desc')))))
await it('lists submissions for a cutoff', () =>
  assertSucceeds(getDocs(query(collection(as(SENIOR), 'submissions'), where('cutoffId', '==', CUTOFF)))))
await it('reads an employee\'s history', () =>
  assertSucceeds(getDocs(query(collection(as(SENIOR), 'logs'), where('employeeId', '==', EMP)))))
await it('approves a DTR', () =>
  assertSucceeds(updateDoc(doc(as(SENIOR), 'submissions', `${EMP}_${CUTOFF}`), { status: 'approved' })))
await it('notifies the employee', () =>
  assertSucceeds(setDoc(doc(as(SENIOR), 'notifications', 'n_new'), { recipientId: EMP, type: 'DTR_APPROVED', read: false })))

console.log('\nthe app must still work — admin (AdminDashboard.jsx / CutoffsView.jsx)')
await it('lists all users', () =>
  assertSucceeds(getDocs(collection(as(ADMIN), 'users'))))
await it('changes a role', () =>
  assertSucceeds(updateDoc(doc(as(ADMIN), 'users', EMP), { role: 'admin' })))
await it('assigns a senior', () =>
  assertSucceeds(updateDoc(doc(as(ADMIN), 'users', EMP2), { assignedSeniorId: SENIOR })))
await it('creates a cutoff', () =>
  assertSucceeds(setDoc(doc(as(ADMIN), 'cutoffs', 'cutoff2'),
    { startDate: new Date(), endDate: new Date(), createdAt: new Date(), submitBy: new Date() })))
await it('sets a cutoff deadline — the write that started all this', () =>
  assertSucceeds(updateDoc(doc(as(ADMIN), 'cutoffs', CUTOFF), { submitBy: new Date() })))
await it('corrects an employee\'s log', () =>
  assertSucceeds(updateDoc(doc(as(ADMIN), 'logs', 'log_emp2'), { timestamp: new Date() })))
await it('reads the reminder settings', () =>
  assertSucceeds(getDoc(doc(as(ADMIN), 'settings', 'dtrReminder'))))

console.log('\nsubmitting a DTR — the exact reads and writes api.submitDTR makes')
// A first submission for a cutoff reads the doc before it exists (to merge
// earlier attachments). A rule that reads resource.data errors on a missing
// doc, which denies — and that is the "Missing or insufficient permissions"
// employees hit on Send to Admin.
await it('reads its own submission before it exists (first submit of a cutoff)', () =>
  assertSucceeds(getDoc(doc(as(EMP2), 'submissions', `${EMP2}_${CUTOFF}`))))
await it('Dashboard load: checks for a submission that does not exist yet', () =>
  assertSucceeds(getDoc(doc(as(EMP2), 'submissions', `${EMP2}_cutoff2`))))
await it('creates it', () =>
  assertSucceeds(setDoc(doc(as(EMP2), 'submissions', `${EMP2}_${CUTOFF}`),
    { userId: EMP2, cutoffId: CUTOFF, status: 'pending', submittedAt: new Date() })))
await it('cannot probe for someone else\'s missing submission', () =>
  assertFails(getDoc(doc(as(EMP2), 'submissions', `${EMP}_cutoff2`))))
await it('cannot create a submission under someone else\'s id', () =>
  assertFails(setDoc(doc(as(EMP2), 'submissions', `${EMP}_cutoff2`),
    { userId: EMP2, cutoffId: 'cutoff2', status: 'pending' })))
await it('cannot create their own submission already approved', () =>
  assertFails(setDoc(doc(as(EMP2), 'submissions', `${EMP2}_cutoff3`),
    { userId: EMP2, cutoffId: 'cutoff3', status: 'approved' })))
await it('cannot cancel a submission once it is approved', async () => {
  await testEnv.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'submissions', `${EMP2}_cutoff4`),
    { userId: EMP2, cutoffId: 'cutoff4', status: 'approved' }))
  await assertFails(deleteDoc(doc(as(EMP2), 'submissions', `${EMP2}_cutoff4`)))
})
// "Resubmit / Update" deletes the pending submission so it can be redone.
await it('cancels their own pending submission (Resubmit / Update)', () =>
  assertSucceeds(deleteDoc(doc(as(EMP2), 'submissions', `${EMP2}_${CUTOFF}`))))
await it('cannot delete another employee\'s submission', () =>
  assertFails(deleteDoc(doc(as(EMP2), 'submissions', `${EMP}_${CUTOFF}`))))
await it('a removed person cannot probe for a missing submission', () =>
  assertFails(getDoc(doc(as(GONE), 'submissions', `${GONE}_cutoff2`))))

console.log('\nremoving people who have left')
await it('a plain admin cannot remove anyone', () =>
  assertFails(updateDoc(doc(as(PLAIN_ADMIN), 'users', LEAVER), { removed: true, removedAt: new Date(), removedBy: PLAIN_ADMIN })))
await it('an employee cannot un-remove themselves', () =>
  assertFails(updateDoc(doc(as(GONE), 'users', GONE), { removed: false })))
await it('a super admin cannot remove themselves', () =>
  assertFails(updateDoc(doc(as(ADMIN), 'users', ADMIN), { removed: true, removedAt: new Date(), removedBy: ADMIN })))
await it('a super admin removes someone', () =>
  assertSucceeds(updateDoc(doc(as(ADMIN), 'users', LEAVER), { removed: true, removedAt: new Date(), removedBy: ADMIN })))
await it('a super admin restores them', () =>
  assertSucceeds(updateDoc(doc(as(ADMIN), 'users', LEAVER), { removed: false, removedAt: null, removedBy: null })))
await it('a plain admin can still change roles', () =>
  assertSucceeds(updateDoc(doc(as(PLAIN_ADMIN), 'users', EMP2), { role: 'employee' })))
await it('a removed person still reads their own profile (so the app can say why)', () =>
  assertSucceeds(getDoc(doc(as(GONE), 'users', GONE))))
await it('a removed person cannot read their logs', () =>
  assertFails(getDocs(query(collection(as(GONE), 'logs'), where('employeeId', '==', GONE)))))
await it('a removed person cannot clock in', () =>
  assertFails(setDoc(doc(as(GONE), 'logs', 'gone_new'), { employeeId: GONE, type: 'IN', timestamp: new Date() })))
await it('a removed person cannot edit their old logs', () =>
  assertFails(updateDoc(doc(as(GONE), 'logs', 'log_gone'), { timestamp: new Date() })))
await it('a removed person cannot resubmit a DTR', () =>
  assertFails(setDoc(doc(as(GONE), 'submissions', `${GONE}_${CUTOFF}`), { userId: GONE, cutoffId: CUTOFF, status: 'pending' })))
await it('a removed person cannot read their notifications', () =>
  assertFails(getDoc(doc(as(GONE), 'notifications', 'n_gone'))))
await it('a removed senior/admin loses staff access to users', () =>
  assertFails(getDocs(collection(as(GONE_SENIOR), 'users'))))
await it('a removed senior/admin loses staff access to logs', () =>
  assertFails(getDoc(doc(as(GONE_SENIOR), 'logs', 'log_emp'))))
await it('staff can still read a removed person\'s history (payroll)', () =>
  assertSucceeds(getDocs(query(collection(as(ADMIN), 'logs'), where('employeeId', '==', GONE)))))

console.log(`\n${pass} passed, ${fail} failed\n`)
await testEnv.cleanup()
process.exit(fail ? 1 : 0)
