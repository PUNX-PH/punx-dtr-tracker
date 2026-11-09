// Pure-logic tests for src/services/leave.js. No Firebase, no emulator:
//
//   node tests/leave.test.mjs
//
// These pin the rules the whole feature leans on — what a request costs, what
// counts as used, what may overlap — because the form, the approval check and
// the DTR overlay all call the same functions.
import assert from 'node:assert/strict'
import {
  parseYMD, toYMD, workdaysBetween, countWorkdays, summarize, validateRequest,
  findOverlap, leaveForDate, requestAmount, dtrLabel, leaveNote, canUseLeave, LEAVE_TAB_ENABLED, DEFAULT_ALLOTMENT,
  isPartialDay, requestLabel,
} from '../src/services/leave.js'

let pass = 0, fail = 0
function it(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); pass++ }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message.split('\n')[0]}`); fail++ }
}

const req = (o) => ({ status: 'approved', type: 'sick', startDate: '2026-10-12', endDate: '2026-10-12', days: 1, hours: 0, ...o })

console.log('\ndates (the UTC off-by-one this app has been bitten by)')
it('parses YYYY-MM-DD as LOCAL midnight', () => {
  const d = parseYMD('2026-09-10')
  assert.equal(d.getDate(), 10); assert.equal(d.getMonth(), 8); assert.equal(d.getHours(), 0)
})
it('round-trips through toYMD', () => assert.equal(toYMD(parseYMD('2026-01-31')), '2026-01-31'))
it('rejects dates that do not exist instead of rolling them over', () => {
  assert.equal(parseYMD('2026-02-31'), null)
  assert.equal(parseYMD('nope'), null)
  assert.equal(parseYMD(undefined), null)
})

console.log('\nworking days')
it('Mon-Fri week is 5', () => assert.equal(countWorkdays('2026-10-12', '2026-10-16'), 5))
it('a Fri-Mon range is 2 days, weekend excluded', () => assert.equal(countWorkdays('2026-10-16', '2026-10-19'), 2))
it('weekend only is 0', () => assert.equal(countWorkdays('2026-10-17', '2026-10-18'), 0))
it('end before start is empty, not negative', () => assert.deepEqual(workdaysBetween('2026-10-16', '2026-10-12'), []))
it('spans a month boundary', () => assert.equal(countWorkdays('2026-10-29', '2026-11-03'), 4))

console.log('\nbalances')
const A = { sick: 5, vacation: 10, offset: 8 }
it('used counts approved only; pending is tracked separately', () => {
  const s = summarize(A, [req({ days: 2 }), req({ status: 'pending', days: 1 }), req({ status: 'rejected', days: 3 })])
  assert.equal(s.sick.used, 2); assert.equal(s.sick.pending, 1)
  assert.equal(s.sick.remaining, 3); assert.equal(s.sick.available, 2)
})
it('offset is kept in hours, leave in days', () => {
  const s = summarize(A, [req({ type: 'offset', hours: 4, days: 0 })])
  assert.equal(s.offset.used, 4); assert.equal(s.offset.remaining, 4)
  assert.equal(s.vacation.used, 0)
})
it('half-hour offsets do not accumulate float error', () => {
  const s = summarize(A, [req({ type: 'offset', hours: 0.5, days: 0 }), req({ type: 'offset', hours: 0.5, days: 0, startDate: '2026-10-13', endDate: '2026-10-13' })])
  assert.equal(s.offset.used, 1)
})
it('no balance doc falls back to the defaults', () => {
  const s = summarize(undefined, [])
  assert.equal(s.sick.allotted, DEFAULT_ALLOTMENT.sick)
  assert.equal(s.offset.allotted, 0)
})
it('a revoked (rejected) approval returns the balance', () => {
  const approved = summarize(A, [req({ days: 2 })])
  const revoked = summarize(A, [req({ days: 2, status: 'rejected' })])
  assert.equal(approved.sick.remaining, 3); assert.equal(revoked.sick.remaining, 5)
})

console.log('\nvalidation')
const S = summarize(A, [])
it('accepts a normal sick leave and prices it in workdays', () => {
  const v = validateRequest({ type: 'sick', startDate: '2026-10-12', endDate: '2026-10-14' }, S, [])
  assert.equal(v.error, undefined); assert.equal(v.amount, 3)
})
it('rejects an over-balance request and says how much is available', () => {
  const v = validateRequest({ type: 'sick', startDate: '2026-10-12', endDate: '2026-10-20' }, S, [])
  assert.match(v.error, /Not enough/)
})
it('pending requests reduce what is available to a new one', () => {
  const s = summarize(A, [req({ status: 'pending', days: 4, startDate: '2026-11-02', endDate: '2026-11-05' })])
  const v = validateRequest({ type: 'sick', startDate: '2026-10-12', endDate: '2026-10-13' }, s, [])
  assert.match(v.error, /Not enough/); assert.match(v.error, /pending/)
})
it('rejects end before start', () =>
  assert.match(validateRequest({ type: 'vacation', startDate: '2026-10-14', endDate: '2026-10-12' }, S, []).error, /before/))
it('rejects a weekend-only range', () =>
  assert.match(validateRequest({ type: 'vacation', startDate: '2026-10-17', endDate: '2026-10-18' }, S, []).error, /no working days/))
it('rejects an overlap with a pending or approved request, but not a rejected one', () => {
  const existing = [req({ status: 'pending', startDate: '2026-10-12', endDate: '2026-10-13' })]
  assert.match(validateRequest({ type: 'vacation', startDate: '2026-10-13', endDate: '2026-10-14' }, S, existing).error, /overlaps/)
  const rejected = [req({ status: 'rejected', startDate: '2026-10-12', endDate: '2026-10-13' })]
  assert.equal(validateRequest({ type: 'vacation', startDate: '2026-10-13', endDate: '2026-10-14' }, S, rejected).error, undefined)
})
it('offset: one date, hours in half steps, max a day, weekdays only', () => {
  assert.equal(validateRequest({ type: 'offset', startDate: '2026-10-12', hours: 4 }, S, []).amount, 4)
  assert.match(validateRequest({ type: 'offset', startDate: '2026-10-12', hours: 0 }, S, []).error, /hours/)
  assert.match(validateRequest({ type: 'offset', startDate: '2026-10-12', hours: 9 }, S, []).error, /at most/)
  assert.match(validateRequest({ type: 'offset', startDate: '2026-10-12', hours: 1.3 }, S, []).error, /half-hour/)
  assert.match(validateRequest({ type: 'offset', startDate: '2026-10-17', hours: 2 }, S, []).error, /weekday/)
})
it('offset ignores any endDate it is given', () => {
  const v = validateRequest({ type: 'offset', startDate: '2026-10-12', endDate: '2026-10-30', hours: 2 }, S, [])
  assert.equal(v.endDate, '2026-10-12')
})
it('offset cannot exceed the offset balance (default 0)', () => {
  const v = validateRequest({ type: 'offset', startDate: '2026-10-12', hours: 2 }, summarize(undefined, []), [])
  assert.match(v.error, /Not enough/)
})
it('unknown type is refused', () =>
  assert.match(validateRequest({ type: 'sabbatical', startDate: '2026-10-12', endDate: '2026-10-12' }, S, []).error, /type/))

console.log('\nDTR overlay')
const d = (s) => parseYMD(s)
it('shows an approved leave on its weekdays only', () => {
  const r = req({ startDate: '2026-10-16', endDate: '2026-10-19', days: 2 }) // Fri..Mon
  assert.ok(leaveForDate([r], d('2026-10-16')))
  assert.equal(leaveForDate([r], d('2026-10-17')), null) // Saturday
  assert.equal(leaveForDate([r], d('2026-10-18')), null) // Sunday
  assert.ok(leaveForDate([r], d('2026-10-19')))
  assert.equal(leaveForDate([r], d('2026-10-20')), null)
})
it('never shows pending or rejected', () => {
  assert.equal(leaveForDate([req({ status: 'pending' })], d('2026-10-12')), null)
  assert.equal(leaveForDate([req({ status: 'rejected' })], d('2026-10-12')), null)
})
it('offset claims its one date and labels the hours', () => {
  const r = req({ type: 'offset', hours: 4, days: 0 })
  assert.ok(leaveForDate([r], d('2026-10-12')))
  assert.equal(dtrLabel(r), 'OFFSET · 4 hrs')
  assert.equal(dtrLabel(req({ type: 'offset', hours: 1, days: 0 })), 'OFFSET · 1 hr')
})
it('the DTR note carries the type and the reason, and survives a missing reason', () => {
  assert.equal(leaveNote(req({ reason: 'Fever' })), 'Sick Leave — Fever')
  assert.equal(leaveNote(req({ reason: '' })), 'Sick Leave')
  assert.equal(leaveNote(req({ type: 'offset', hours: 4, days: 0, reason: 'Saturday OT' })), 'Offset · 4 hrs — Saturday OT')
  assert.equal(leaveNote(req({ type: 'vacation', reason: undefined })), 'Vacation Leave')
})
it('the Leave tab is hidden from everyone while the master switch is off', () => {
  for (const role of ['admin', 'super_admin', 'employee']) assert.equal(canUseLeave({ role }, false), false)
})
it('the shipped default follows the switch: super admins only', () => {
  assert.equal(canUseLeave({ role: 'admin' }), false)
  assert.equal(canUseLeave({ role: 'super_admin' }), LEAVE_TAB_ENABLED)
  assert.equal(canUseLeave({ role: 'employee' }), false)
})
it('with the switch on, only super admins get it (testing phase)', () => {
  assert.equal(canUseLeave({ role: 'admin' }, true), false)
  assert.equal(canUseLeave({ role: 'super_admin' }, true), true)
  assert.equal(canUseLeave({ role: 'employee' }, true), false)
  assert.equal(canUseLeave({ role: 'employee', isSenior: true }, true), false)
  assert.equal(canUseLeave(null, true), false)
})
it('handles an empty or missing list', () => {
  assert.equal(leaveForDate([], d('2026-10-12')), null)
  assert.equal(leaveForDate(undefined, d('2026-10-12')), null)
})
it('findOverlap / requestAmount sanity', () => {
  assert.equal(requestAmount(req({ days: 3 })), 3)
  assert.equal(requestAmount(req({ type: 'offset', hours: 2.5, days: 0 })), 2.5)
  assert.equal(findOverlap([req()], '2026-10-13', '2026-10-14'), null)
})

console.log('\npart of a day (sick / vacation filed in hours)')
const part = (o) => validateRequest({ type: 'sick', startDate: '2026-10-12', unit: 'hours', hours: 4, ...o }, S, [])
it('4 hours is half a day, on one date, and keeps its hours', () => {
  const v = part({})
  assert.equal(v.error, undefined); assert.equal(v.amount, 0.5); assert.equal(v.hours, 4); assert.equal(v.endDate, '2026-10-12')
})
it('half-hour steps cost an exact fraction: 3.5 hours is 7/16 of a day', () => assert.equal(part({ hours: 3.5 }).amount, 0.4375))
it('8 hours is a whole day', () => assert.equal(part({ hours: 8 }).amount, 1))
it('works for vacation too', () => assert.equal(part({ type: 'vacation', hours: 2 }).amount, 0.25))
it('limits: more than a day, zero, odd minutes and weekends are refused', () => {
  assert.match(part({ hours: 9 }).error, /at most/)
  assert.match(part({ hours: 0 }).error, /Enter how many hours/)
  assert.match(part({ hours: 1.3 }).error, /half-hour/)
  assert.match(part({ startDate: '2026-10-17' }).error, /weekday/)
})
it('a part-day ignores any end date it is handed', () => assert.equal(part({ endDate: '2026-10-30' }).endDate, '2026-10-12'))
it('it draws on the day balance and is refused when there is not enough left', () => {
  const low = summarize({ sick: 0.25, vacation: 5, offset: 0 }, [])
  assert.match(validateRequest({ type: 'sick', startDate: '2026-10-12', unit: 'hours', hours: 4 }, low, []).error, /Not enough/)
  assert.equal(validateRequest({ type: 'sick', startDate: '2026-10-12', unit: 'hours', hours: 2 }, low, []).error, undefined)
})
it('whole-day requests are unchanged: the hours field is ignored and nothing is stored in it', () => {
  const v = validateRequest({ type: 'sick', startDate: '2026-10-12', endDate: '2026-10-14', hours: 4 }, S, [])
  assert.equal(v.amount, 3); assert.equal(v.hours, 0)
})
it('used balance adds part-days up in days', () => {
  const s = summarize(A, [req({ days: 0.5, hours: 4 }), req({ days: 0.25, hours: 2, startDate: '2026-10-13', endDate: '2026-10-13' })])
  assert.equal(s.sick.used, 0.75); assert.equal(s.sick.remaining, 4.25)
})
it('it still blocks another request on the same date (no two requests share a day)', () => {
  const existing = [req({ status: 'pending', days: 0.5, hours: 4 })]
  assert.match(validateRequest({ type: 'vacation', startDate: '2026-10-12', unit: 'hours', hours: 2 }, S, existing).error, /overlaps/)
})
it('says it in hours: label, DTR badge and note', () => {
  const r = req({ days: 0.5, hours: 4, reason: 'Dentist' })
  assert.equal(isPartialDay(r), true)
  assert.equal(isPartialDay(req({ days: 2 })), false)
  assert.equal(isPartialDay(req({ type: 'offset', hours: 4, days: 0 })), false) // offset is its own thing
  assert.equal(requestLabel(r), '4 hrs (0.5 days)')
  assert.equal(requestLabel(req({ days: 2 })), '2 days')
  assert.equal(requestLabel(req({ type: 'offset', hours: 4, days: 0 })), '4 hrs')
  assert.equal(dtrLabel(r), 'SL · 4 hrs')
  assert.equal(leaveNote(r), 'Sick Leave · 4 hrs — Dentist')
})
it('an approved part-day shows on its date', () =>
  assert.ok(leaveForDate([req({ days: 0.5, hours: 4 })], parseYMD('2026-10-12'))))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
