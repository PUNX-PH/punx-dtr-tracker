// node tests/overtime.test.mjs — the OT → offset rule: counted per cutoff, the
// first 20 hours stay OT, the excess becomes offset 1:1, credited from approved
// DTRs only, and a warning (not a cap) past 30 hours of offset.
import assert from 'node:assert/strict'
import {
  OT_THRESHOLD_HOURS, OFFSET_WARN_HOURS, formatDuration, otHoursFromLogs, otForPeriod, splitOT, cutoffWindow, offsetEarnedByUser, offsetOverWarning,
} from '../src/services/overtime.js'
import { canSeeOvertimeOffset } from '../src/services/leave.js'

let pass = 0, fail = 0
function it(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); pass++ }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message.split('\n')[0]}`); fail++ }
}
const at = (d, h, m) => new Date(2026, 9, d, h, m)
const ot = (type, d, h, m, session) => ({ type, timestamp: at(d, h, m), ...(session !== undefined ? { session } : {}) })

console.log('\nthe numbers')
it('the thresholds are 20 hours of OT and a warning at 30 hours of offset', () => {
  assert.equal(OT_THRESHOLD_HOURS, 20)
  assert.equal(OFFSET_WARN_HOURS, 30)
})

console.log('\ncounting OT from the DTR')
it('one session', () => {
  const r = otHoursFromLogs([ot('OT_IN', 5, 18, 0), ot('OT_OUT', 5, 21, 30)])
  assert.equal(r.hours, 3.5); assert.equal(r.minutes, 210); assert.equal(r.sessions, 1); assert.equal(r.skipped, 0)
  assert.deepEqual(r.byDay, { '2026-10-05': 210 })
})
it('split OT: several sessions on one day, and across days, add up', () => {
  const r = otHoursFromLogs([
    ot('OT_IN', 5, 18, 0, 0), ot('OT_OUT', 5, 20, 0, 0),
    ot('OT_IN', 5, 21, 0, 1), ot('OT_OUT', 5, 22, 30, 1),
    ot('OT_IN', 6, 18, 0), ot('OT_OUT', 6, 19, 15),
  ])
  assert.equal(r.hours, 4.75); assert.equal(r.sessions, 3)
})
it('regular IN/OUT and notes are not overtime', () =>
  assert.equal(otHoursFromLogs([{ type: 'IN', timestamp: at(5, 9, 0) }, { type: 'OUT', timestamp: at(5, 18, 0) }, { type: 'EDIT', timestamp: at(5, 9, 0) }]).hours, 0))
it('an IN with no OUT counts for nothing and is reported', () => {
  const r = otHoursFromLogs([ot('OT_IN', 5, 18, 0)])
  assert.equal(r.hours, 0); assert.equal(r.skipped, 1)
})
it('an OUT not after its IN (an overnight session on one row) is skipped, never negative or invented', () => {
  const r = otHoursFromLogs([ot('OT_IN', 5, 18, 0), ot('OT_OUT', 5, 2, 0)])
  assert.equal(r.hours, 0); assert.equal(r.skipped, 1)
})
it('minutes are kept: 1h20m is 1.33 hours', () =>
  assert.equal(otHoursFromLogs([ot('OT_IN', 5, 18, 0), ot('OT_OUT', 5, 19, 20)]).hours, 1.33))
it('works from ISO strings as the api returns them', () =>
  assert.equal(otHoursFromLogs([{ type: 'OT_IN', timestamp: at(5, 18, 0).toISOString() }, { type: 'OT_OUT', timestamp: at(5, 20, 0).toISOString() }]).hours, 2))
it('no logs is zero, not an error', () => assert.deepEqual(otHoursFromLogs(), { hours: 0, minutes: 0, sessions: 0, skipped: 0, incomplete: [], byDay: {} }))

console.log('\nwhere the incomplete entries are')
it('names the day, the session and what is wrong, in date order', () => {
  const r = otHoursFromLogs([
    ot('OT_IN', 9, 18, 0),                           // no end
    ot('OT_OUT', 6, 20, 0),                          // no start
    ot('OT_IN', 7, 18, 0), ot('OT_OUT', 7, 2, 0),    // end before start
    ot('OT_IN', 8, 18, 0), ot('OT_OUT', 8, 19, 0),   // fine
  ])
  assert.deepEqual(r.incomplete.map(i => [i.day, i.problem]), [['2026-10-06', 'no-start'], ['2026-10-07', 'bad-order'], ['2026-10-09', 'no-end']])
  assert.equal(r.skipped, 3); assert.equal(r.minutes, 60)
  assert.equal(r.incomplete[2].inAt.getHours(), 18) // the start time is there to show
})
it('a complete second session on the same day does not hide an incomplete first one', () => {
  const r = otHoursFromLogs([ot('OT_IN', 5, 18, 0, 0), ot('OT_IN', 5, 21, 0, 1), ot('OT_OUT', 5, 22, 0, 1)])
  assert.deepEqual(r.incomplete.map(i => [i.day, i.session, i.problem]), [['2026-10-05', 0, 'no-end']])
  assert.deepEqual(r.byDay, { '2026-10-05': 60 })
})
it('byDay gives each day its own total, split sessions added together', () => {
  const r = otHoursFromLogs([
    ot('OT_IN', 5, 18, 0, 0), ot('OT_OUT', 5, 19, 30, 0), ot('OT_IN', 5, 21, 0, 1), ot('OT_OUT', 5, 22, 0, 1),
    ot('OT_IN', 6, 18, 0), ot('OT_OUT', 6, 18, 45),
  ])
  assert.deepEqual(r.byDay, { '2026-10-05': 150, '2026-10-06': 45 })
})
it('otForPeriod counts only the cutoff days, and everything when there is no cutoff', () => {
  const logs = [ot('OT_IN', 5, 18, 0), ot('OT_OUT', 5, 20, 0), ot('OT_IN', 20, 18, 0), ot('OT_OUT', 20, 19, 0)]
  const cutoff = { startDate: { toDate: () => new Date(2026, 9, 1, 8) }, endDate: { toDate: () => new Date(2026, 9, 15, 8) } }
  assert.equal(otForPeriod(logs, cutoff).minutes, 120)
  assert.equal(otForPeriod(logs, cutoff).window.startYMD, '2026-10-01')
  assert.equal(otForPeriod(logs, null).minutes, 180)
  assert.equal(otForPeriod(logs, null).window, null)
})

console.log('\nhours and minutes for people to read')
it('minutes are exact, so the total can be said as hours and minutes', () => {
  const r = otHoursFromLogs([
    { type: 'OT_IN', timestamp: at(5, 18, 0) }, { type: 'OT_OUT', timestamp: at(5, 20, 15) },
    { type: 'OT_IN', timestamp: at(6, 18, 0) }, { type: 'OT_OUT', timestamp: at(6, 19, 20) },
  ])
  assert.equal(r.minutes, 215) // 2h15m + 1h20m
  assert.equal(formatDuration(r.minutes), '3 hrs 35 mins')
})
it('wording: singular and plural, whole hours, under an hour, zero', () => {
  assert.equal(formatDuration(1590), '26 hrs 30 mins')
  assert.equal(formatDuration(60), '1 hr')
  assert.equal(formatDuration(120), '2 hrs')
  assert.equal(formatDuration(61), '1 hr 1 min')
  assert.equal(formatDuration(45), '45 mins')
  assert.equal(formatDuration(1), '1 min')
  assert.equal(formatDuration(0), '0 mins')
  assert.equal(formatDuration(-5), '0 mins')
  assert.equal(formatDuration(undefined), '0 mins')
})

console.log('\nthe 20-hour rule')
it('under 20 hours: nothing converts', () => assert.deepEqual(splitOT(14.5), { kept: 14.5, excess: 0 }))
it('exactly 20: nothing converts', () => assert.deepEqual(splitOT(20), { kept: 20, excess: 0 }))
it('past 20: only the excess becomes offset', () => assert.deepEqual(splitOT(26.5), { kept: 20, excess: 6.5 }))
it('a heavy cutoff', () => assert.deepEqual(splitOT(45), { kept: 20, excess: 25 }))
it('junk is zero', () => { assert.deepEqual(splitOT(-3), { kept: 0, excess: 0 }); assert.deepEqual(splitOT('x'), { kept: 0, excess: 0 }) })
it('the counter RESETS each cutoff: 15h + 15h in two cutoffs converts nothing, 30h in one converts 10', () => {
  assert.equal(splitOT(15).excess + splitOT(15).excess, 0)
  assert.equal(splitOT(30).excess, 10)
})

console.log('\nthe cutoff window')
it('covers whole local days, first to last', () => {
  const w = cutoffWindow({ startDate: { toDate: () => new Date(2026, 9, 16, 8, 0) }, endDate: { toDate: () => new Date(2026, 9, 30, 8, 0) } })
  assert.equal(w.startYMD, '2026-10-16'); assert.equal(w.endYMD, '2026-10-30')
  assert.equal(w.from.getHours(), 0)
  assert.equal(w.to.getDate(), 30); assert.equal(w.to.getHours(), 23)
})

console.log('\nwho has earned what')
it('only APPROVED cutoffs count', () => {
  const subs = [
    { userId: 'a', status: 'approved', offsetEarned: 6.5 },
    { userId: 'a', status: 'approved', offsetEarned: 2 },
    { userId: 'a', status: 'pending_senior', offsetEarned: 50 }, // smuggled onto a pending one: ignored
    { userId: 'a', status: 'rejected', offsetEarned: 9 },
    { userId: 'b', status: 'approved', offsetEarned: 0 },
    { userId: 'c', status: 'approved' },
    { userId: 'd', status: 'approved', offsetEarned: 'lots' },
  ]
  assert.deepEqual(offsetEarnedByUser(subs), { a: 8.5 })
})
it('re-approving replaces, never stacks (the snapshot lives on one submission)', () =>
  assert.deepEqual(offsetEarnedByUser([{ userId: 'a', status: 'approved', offsetEarned: 4 }]), { a: 4 }))

console.log('\nthe 30-hour warning (a flag, not a cap)')
it('warns strictly above 30', () => {
  assert.equal(offsetOverWarning(30), false)
  assert.equal(offsetOverWarning(30.5), true)
  assert.equal(offsetOverWarning(55), true) // still allowed — nothing is capped
  assert.equal(offsetOverWarning(0), false)
  assert.equal(offsetOverWarning(undefined), false)
})

console.log('\nwho can see any of this (testing phase)')
it('super admins only — not admins, seniors, managers or employees', () => {
  assert.equal(canSeeOvertimeOffset({ role: 'super_admin' }, true), true)
  for (const u of [{ role: 'admin' }, { role: 'employee' }, { role: 'employee', isSenior: true }, { role: 'employee', isManager: true, managedDepartmentIds: ['eng'] }, null]) {
    assert.equal(canSeeOvertimeOffset(u, true), false)
  }
})
it('hidden from everyone when the master switch is off', () =>
  assert.equal(canSeeOvertimeOffset({ role: 'super_admin' }, false), false))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
