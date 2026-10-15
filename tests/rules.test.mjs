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

// api.ensureUserProfile does NOT go straight to setDoc. For an account with no
// profile it reads users/{uid}, then runs the legacy `where('uid','==',uid)`
// list query, and only then creates the profile. If that list query is denied
// the whole function throws into its catch, which returns an in-memory profile
// and never writes — the person works normally (their own logs are allowed
// without a profile) but never appears in the admin's employee list.
console.log('\nfirst sign-in — the exact sequence api.ensureUserProfile runs')
const NEWBIE = 'newbie1'
await it('reads its own missing profile', () =>
  assertSucceeds(getDoc(doc(as(NEWBIE), 'users', NEWBIE))))
await it('runs the legacy lookup by its own uid', () =>
  assertSucceeds(getDocs(query(collection(as(NEWBIE), 'users'), where('uid', '==', NEWBIE)))))
await it('then creates the profile', () =>
  assertSucceeds(setDoc(doc(as(NEWBIE), 'users', NEWBIE),
    { uid: NEWBIE, name: 'Newbie', email: 'newbie1@punx.ai', role: 'employee' })))
await it('the new profile is then visible to an admin listing users', async () => {
  const snap = await assertSucceeds(getDocs(collection(as(ADMIN), 'users')))
  if (!snap.docs.some(d => d.id === NEWBIE)) throw new Error('profile not in the admin list')
})
await it('the legacy lookup cannot be pointed at someone else\'s uid', () =>
  assertFails(getDocs(query(collection(as(NEWBIE), 'users'), where('uid', '==', EMP)))))
await it('the legacy lookup cannot be used to harvest pins via the admin\'s uid', () =>
  assertFails(getDocs(query(collection(as(NEWBIE), 'users'), where('uid', '==', ADMIN)))))
await it('a removed person can still run the lookup on themselves', () =>
  assertSucceeds(getDocs(query(collection(as(GONE), 'users'), where('uid', '==', GONE)))))

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
// …and back, which is load-bearing rather than tidy. EMP is the stand-in
// employee for every section below, so leaving them promoted made nine later
// assertFails pass for the wrong reason — the rule allowed the write because
// EMP really was an admin by then — and broke two admin assertions as
// collateral, because one of those nine deleted a fixture a later test needed.
await it('and back again, so the sections below still have an employee', () =>
  assertSucceeds(updateDoc(doc(as(ADMIN), 'users', EMP), { role: 'employee' })))
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

console.log('\nleave & offset (leaveRequests / leaveBalances / leaveAdjustments)')
const SENIOR2 = 'senior2'  // a senior who is NOT emp1's senior
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore()
  await updateDoc(doc(db, 'users', EMP), { assignedSeniorId: SENIOR })
  await setDoc(doc(db, 'users', SENIOR2), { uid: SENIOR2, name: 'Sen2', email: 's2@punx.ai', role: 'employee', isSenior: true })
  await setDoc(doc(db, 'leaveRequests', 'lr_emp'), { userId: EMP, userName: 'Emp', type: 'sick', startDate: '2026-10-12', endDate: '2026-10-12', days: 1, hours: 0, reason: '', status: 'pending', createdAt: new Date() })
  await setDoc(doc(db, 'leaveRequests', 'lr_emp2'), { userId: EMP2, userName: 'Emp2', type: 'sick', startDate: '2026-10-12', endDate: '2026-10-12', days: 1, hours: 0, reason: '', status: 'pending', createdAt: new Date() })
  await setDoc(doc(db, 'leaveRequests', 'lr_done'), { userId: EMP, userName: 'Emp', type: 'vacation', startDate: '2026-10-13', endDate: '2026-10-13', days: 1, hours: 0, reason: '', status: 'approved', createdAt: new Date() })
  await setDoc(doc(db, 'leaveRequests', 'lr_padmin'), { userId: PLAIN_ADMIN, userName: 'PAdm', type: 'sick', startDate: '2026-10-14', endDate: '2026-10-14', days: 1, hours: 0, reason: '', status: 'pending', createdAt: new Date() })
  await setDoc(doc(db, 'leaveBalances', EMP), { sick: 5, vacation: 5, offset: 8 })
  await setDoc(doc(db, 'leaveBalances', EMP2), { sick: 5, vacation: 5, offset: 0 })
  await setDoc(doc(db, 'leaveAdjustments', 'adj_emp'), { userId: EMP, type: 'offset', delta: 8, before: 0, after: 8, reason: 'x', byId: ADMIN, createdAt: new Date() })
  await setDoc(doc(db, 'leaveAdjustments', 'adj_emp2'), { userId: EMP2, type: 'offset', delta: 8, before: 0, after: 8, reason: 'x', byId: ADMIN, createdAt: new Date() })
})
const newReq = (uid, over = {}) => ({
  userId: uid, userName: 'x', type: 'sick', startDate: '2026-11-02', endDate: '2026-11-03',
  days: 2, hours: 0, reason: '', status: 'pending', createdAt: new Date(), ...over,
})
const review = (uid, extra = {}) => ({ status: 'approved', reviewerId: uid, reviewerName: 'R', reviewedAt: new Date(), reviewNote: '', ...extra })

console.log('  employee')
await it('files a pending request of their own', () =>
  assertSucceeds(setDoc(doc(as(EMP), 'leaveRequests', 'lr_new'), newReq(EMP))))
await it('reads their own requests (filtered by userId)', () =>
  assertSucceeds(getDocs(query(collection(as(EMP), 'leaveRequests'), where('userId', '==', EMP)))))
await it('cannot list requests unfiltered', () =>
  assertFails(getDocs(collection(as(EMP), 'leaveRequests'))))
await it('cannot read another employee\'s request', () =>
  assertFails(getDoc(doc(as(EMP), 'leaveRequests', 'lr_emp2'))))
await it('cannot file a request as someone else', () =>
  assertFails(setDoc(doc(as(EMP), 'leaveRequests', 'lr_spoof'), newReq(EMP2))))
await it('cannot file a request already approved', () =>
  assertFails(setDoc(doc(as(EMP), 'leaveRequests', 'lr_pre'), newReq(EMP, { status: 'approved' }))))
await it('cannot smuggle in review fields on create', () =>
  assertFails(setDoc(doc(as(EMP), 'leaveRequests', 'lr_smug'), { ...newReq(EMP), reviewerId: ADMIN })))
await it('cannot file an unknown type', () =>
  assertFails(setDoc(doc(as(EMP), 'leaveRequests', 'lr_type'), newReq(EMP, { type: 'sabbatical' }))))
await it('cannot file more than 8 offset hours in one request', () =>
  assertFails(setDoc(doc(as(EMP), 'leaveRequests', 'lr_big'), newReq(EMP, { type: 'offset', hours: 40, days: 0 }))))
await it('cannot approve their own request', () =>
  assertFails(updateDoc(doc(as(EMP), 'leaveRequests', 'lr_emp'), review(EMP))))
await it('cannot edit their own request (withdraw and refile instead)', () =>
  assertFails(updateDoc(doc(as(EMP), 'leaveRequests', 'lr_emp'), { days: 99 })))
await it('withdraws their own pending request', () =>
  assertSucceeds(deleteDoc(doc(as(EMP), 'leaveRequests', 'lr_new'))))
await it('cannot withdraw an approved request', () =>
  assertFails(deleteDoc(doc(as(EMP), 'leaveRequests', 'lr_done'))))
await it('cannot withdraw someone else\'s request', () =>
  assertFails(deleteDoc(doc(as(EMP), 'leaveRequests', 'lr_emp2'))))
await it('a removed person cannot file a request', () =>
  assertFails(setDoc(doc(as(GONE), 'leaveRequests', 'lr_gone'), newReq(GONE))))

console.log('  approval workflow')
await it('the assigned senior approves their employee\'s request', () =>
  assertSucceeds(updateDoc(doc(as(SENIOR), 'leaveRequests', 'lr_emp'), review(SENIOR))))
await it('...and cannot flip it back once decided', () =>
  assertFails(updateDoc(doc(as(SENIOR), 'leaveRequests', 'lr_emp'), review(SENIOR, { status: 'rejected' }))))
await it('a senior who is not assigned cannot decide it', () =>
  assertFails(updateDoc(doc(as(SENIOR2), 'leaveRequests', 'lr_emp2'), review(SENIOR2))))
await it('a senior cannot decide their own request', async () => {
  await testEnv.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'leaveRequests', 'lr_sen'),
    newReq(SENIOR, { userName: 'Sen' })))
  await assertFails(updateDoc(doc(as(SENIOR), 'leaveRequests', 'lr_sen'), review(SENIOR)))
})
await it('an admin decides anyone\'s request', () =>
  assertSucceeds(updateDoc(doc(as(PLAIN_ADMIN), 'leaveRequests', 'lr_emp2'), review(PLAIN_ADMIN, { status: 'rejected', reviewNote: 'no cover' }))))
await it('an admin cannot decide their own request', () =>
  assertFails(updateDoc(doc(as(PLAIN_ADMIN), 'leaveRequests', 'lr_padmin'), review(PLAIN_ADMIN))))
await it('a decision cannot claim to come from someone else', () =>
  assertFails(updateDoc(doc(as(ADMIN), 'leaveRequests', 'lr_padmin'), review(ADMIN, { reviewerId: PLAIN_ADMIN }))))
await it('a decision cannot also rewrite the request', () =>
  assertFails(updateDoc(doc(as(ADMIN), 'leaveRequests', 'lr_padmin'), { ...review(ADMIN), days: 0 })))
await it('a decision must be approved or rejected, not pending', () =>
  assertFails(updateDoc(doc(as(ADMIN), 'leaveRequests', 'lr_padmin'), review(ADMIN, { status: 'pending' }))))
await it('a removed senior/admin cannot decide anything', () =>
  assertFails(updateDoc(doc(as(GONE_SENIOR), 'leaveRequests', 'lr_padmin'), review(GONE_SENIOR))))
await it('another admin can decide that admin\'s request', () =>
  assertSucceeds(updateDoc(doc(as(ADMIN), 'leaveRequests', 'lr_padmin'), review(ADMIN))))
await it('an admin can revoke an approved request', () =>
  assertSucceeds(updateDoc(doc(as(ADMIN), 'leaveRequests', 'lr_done'), review(ADMIN, { status: 'rejected' }))))
await it('staff read the queue (status filter, as LeaveApprovals loads it)', () =>
  assertSucceeds(getDocs(query(collection(as(SENIOR), 'leaveRequests'), where('status', '==', 'pending')))))
await it('staff read the recent list (orderBy createdAt, as getRequests loads it)', () =>
  assertSucceeds(getDocs(query(collection(as(PLAIN_ADMIN), 'leaveRequests'), orderBy('createdAt', 'desc'), limit(500)))))

console.log('  balances (HR/admin)')
await it('an employee reads their own balance doc', () =>
  assertSucceeds(getDoc(doc(as(EMP), 'leaveBalances', EMP))))
await it('an employee can read "nothing here" for themselves (no doc yet)', () =>
  assertSucceeds(getDoc(doc(as(OUTSIDER), 'leaveBalances', OUTSIDER))))
await it('an employee cannot read someone else\'s balance', () =>
  assertFails(getDoc(doc(as(EMP), 'leaveBalances', EMP2))))
await it('an employee cannot list all balances', () =>
  assertFails(getDocs(collection(as(EMP), 'leaveBalances'))))
await it('an employee cannot grant themselves more leave', () =>
  assertFails(updateDoc(doc(as(EMP), 'leaveBalances', EMP), { sick: 999 })))
await it('an employee cannot create their own balance doc', () =>
  assertFails(setDoc(doc(as(OUTSIDER), 'leaveBalances', OUTSIDER), { sick: 999, vacation: 999, offset: 999 })))
await it('a senior cannot change balances', () =>
  assertFails(updateDoc(doc(as(SENIOR), 'leaveBalances', EMP), { sick: 99 })))
await it('an admin lists all balances', () =>
  assertSucceeds(getDocs(collection(as(PLAIN_ADMIN), 'leaveBalances'))))
await it('an admin adjusts a balance', () =>
  assertSucceeds(setDoc(doc(as(PLAIN_ADMIN), 'leaveBalances', EMP), { sick: 6, vacation: 5, offset: 8 })))
await it('an admin creates the balance doc for someone on defaults', () =>
  assertSucceeds(setDoc(doc(as(ADMIN), 'leaveBalances', LEAVER), { sick: 5, vacation: 5, offset: 4 })))
await it('balance docs cannot be deleted', () =>
  assertFails(deleteDoc(doc(as(ADMIN), 'leaveBalances', EMP))))

console.log('  adjustment audit trail')
await it('an admin writes an adjustment', () =>
  assertSucceeds(setDoc(doc(as(ADMIN), 'leaveAdjustments', 'adj_new'), { userId: EMP, type: 'sick', delta: 1, before: 5, after: 6, reason: 'r', byId: ADMIN, createdAt: new Date() })))
await it('an employee cannot write an adjustment', () =>
  assertFails(setDoc(doc(as(EMP), 'leaveAdjustments', 'adj_self'), { userId: EMP, type: 'sick', delta: 50, before: 5, after: 55, reason: 'r', byId: EMP, createdAt: new Date() })))
await it('an employee reads their own adjustments (filtered by userId)', () =>
  assertSucceeds(getDocs(query(collection(as(EMP), 'leaveAdjustments'), where('userId', '==', EMP)))))
await it('an employee cannot read someone else\'s adjustments', () =>
  assertFails(getDocs(query(collection(as(EMP), 'leaveAdjustments'), where('userId', '==', EMP2)))))
await it('adjustments are append-only, even for admins', async () => {
  await assertFails(updateDoc(doc(as(ADMIN), 'leaveAdjustments', 'adj_emp'), { delta: 100 }))
  await assertFails(deleteDoc(doc(as(ADMIN), 'leaveAdjustments', 'adj_emp')))
})

console.log(`\n${pass} passed, ${fail} failed\n`)
await testEnv.cleanup()
process.exit(fail ? 1 : 0)
