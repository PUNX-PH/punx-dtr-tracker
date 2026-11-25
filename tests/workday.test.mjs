// node tests/workday.test.mjs — regular hours (9:00 AM – 6:00 PM, Mon–Fri, not on
// holidays) and the check that stops overtime being saved inside them.
import assert from 'node:assert/strict'
import { makeIsWorkday, workOverlapMinutes, checkOTSession, WORK_HOURS_TEXT } from '../src/services/workday.js'

let pass = 0, fail = 0
function it(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); pass++ }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message.split('\n')[0]}`); fail++ }
}
// 2026-10-05 is a Monday, 10-09 a Friday, 10-10 a Saturday, 10-11 a Sunday.
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m)
const day = (d) => new Date(2026, 9, d)

console.log('\nwhich days are working days')
it('Monday to Friday are, weekends are not', () => {
  const w = makeIsWorkday()
  assert.equal(w(day(5)), true); assert.equal(w(day(9)), true)
  assert.equal(w(day(10)), false); assert.equal(w(day(11)), false)
})
it('a holiday is not, whether given as an object or a Set', () => {
  assert.equal(makeIsWorkday({ '2026-10-06': [{}] })(day(6)), false)
  assert.equal(makeIsWorkday(new Set(['2026-10-06']))(day(6)), false)
  assert.equal(makeIsWorkday({ '2026-10-06': [{}] })(day(7)), true)
})

console.log('\nhow much of a session is inside regular hours')
it('none before 9 or after 6', () => {
  assert.equal(workOverlapMinutes(at(5, 18), at(5, 21)), 0)
  assert.equal(workOverlapMinutes(at(5, 6), at(5, 9)), 0)
})
it('only the part inside', () => {
  assert.equal(workOverlapMinutes(at(5, 17), at(5, 20)), 60)
  assert.equal(workOverlapMinutes(at(5, 7), at(5, 10)), 60)
  assert.equal(workOverlapMinutes(at(5, 8), at(5, 19)), 9 * 60)
})
it('the whole session when it sits inside', () => assert.equal(workOverlapMinutes(at(5, 10), at(5, 12)), 120))
it('nothing on a weekend or a holiday', () => {
  assert.equal(workOverlapMinutes(at(10, 10), at(10, 12)), 0)
  assert.equal(workOverlapMinutes(at(5, 10), at(5, 12), makeIsWorkday({ '2026-10-05': true })), 0)
})
it('a session over midnight checks the next day too', () => {
  assert.equal(workOverlapMinutes(at(5, 18), new Date(2026, 9, 6, 10, 0)), 60) // Tuesday 9–10
  assert.equal(workOverlapMinutes(at(9, 18), new Date(2026, 9, 10, 10, 0)), 0) // Saturday
})
it('an end at or before the start is nothing', () => assert.equal(workOverlapMinutes(at(5, 12), at(5, 12)), 0))

console.log('\nchecking a session before it is saved')
const kinds = (p) => p.map(x => x.kind)
it('a good session after 6 PM with a reason has no problems', () =>
  assert.deepEqual(checkOTSession({ date: day(5), inTime: '18:00', outTime: '21:00', reason: 'Release night' }), []))
it('no times at all is nothing to check, even without a reason', () =>
  assert.deepEqual(checkOTSession({ date: day(5), inTime: '', outTime: '', reason: '' }), []))
it('a missing or blank reason is refused', () => {
  assert.deepEqual(kinds(checkOTSession({ date: day(5), inTime: '18:00', outTime: '21:00', reason: '' })), ['reason'])
  assert.deepEqual(kinds(checkOTSession({ date: day(5), inTime: '18:00', outTime: '21:00', reason: '   ' })), ['reason'])
})
it('overtime inside regular hours is refused, naming the hours', () => {
  const p = checkOTSession({ date: day(5), inTime: '10:00', outTime: '12:00', reason: 'x' })
  assert.deepEqual(kinds(p), ['work-time'])
  assert.ok(p[0].message.includes('10:00 AM – 12:00 PM')); assert.ok(p[0].message.includes(WORK_HOURS_TEXT))
})
it('starting at 5 PM is refused, 6 PM is fine, 8 AM to 9 AM is fine, 8 AM to 9:01 is not', () => {
  assert.deepEqual(kinds(checkOTSession({ date: day(5), inTime: '17:00', outTime: '20:00', reason: 'x' })), ['work-time'])
  assert.deepEqual(checkOTSession({ date: day(5), inTime: '18:00', outTime: '20:00', reason: 'x' }), [])
  assert.deepEqual(checkOTSession({ date: day(5), inTime: '08:00', outTime: '09:00', reason: 'x' }), [])
  assert.deepEqual(kinds(checkOTSession({ date: day(5), inTime: '08:00', outTime: '09:01', reason: 'x' })), ['work-time'])
})
it('overnight past midnight is fine; one that runs into next working morning is refused', () => {
  assert.deepEqual(checkOTSession({ date: day(5), inTime: '18:00', outTime: '02:13', reason: 'x' }), [])
  assert.deepEqual(kinds(checkOTSession({ date: day(5), inTime: '18:00', outTime: '10:00', reason: 'x' })), ['work-time'])
})
it('weekends and holidays have no regular hours to overlap', () => {
  assert.deepEqual(checkOTSession({ date: day(10), inTime: '10:00', outTime: '12:00', reason: 'x' }), [])
  assert.deepEqual(checkOTSession({ date: day(5), inTime: '10:00', outTime: '12:00', reason: 'x' }, makeIsWorkday({ '2026-10-05': true })), [])
})
it('a half-entered session is checked on what is there', () => {
  assert.deepEqual(kinds(checkOTSession({ date: day(5), inTime: '10:00', outTime: '', reason: 'x' })), ['work-time'])
  assert.deepEqual(checkOTSession({ date: day(5), inTime: '18:00', outTime: '', reason: 'x' }), [])
  assert.deepEqual(kinds(checkOTSession({ date: day(5), inTime: '', outTime: '17:00', reason: '' })), ['reason', 'work-time'])
})
it('both problems are reported together', () =>
  assert.deepEqual(kinds(checkOTSession({ date: day(5), inTime: '10:00', outTime: '11:00', reason: '' })), ['reason', 'work-time']))

console.log('\nregular time that runs past 6 PM is not overtime')
it('a Time out of 6:30 PM pushes the start of overtime to 6:30', () => {
  const blocked = checkOTSession({ date: day(5), inTime: '18:00', outTime: '20:00', reason: 'x', regularOutTime: '18:30' })
  assert.deepEqual(blocked.map(p => p.kind), ['work-time'])
  assert.ok(blocked[0].message.includes('6:30 PM')); assert.ok(blocked[0].message.includes('regular time'))
  assert.deepEqual(checkOTSession({ date: day(5), inTime: '18:30', outTime: '20:00', reason: 'x', regularOutTime: '18:30' }), [])
})
it('a Time out before 6 PM does not loosen the 9-to-6 rule, and none changes nothing', () => {
  assert.deepEqual(checkOTSession({ date: day(5), inTime: '17:30', outTime: '20:00', reason: 'x', regularOutTime: '17:00' }).map(p => p.kind), ['work-time'])
  assert.deepEqual(checkOTSession({ date: day(5), inTime: '18:00', outTime: '20:00', reason: 'x', regularOutTime: '' }), [])
})
it('the overlap maths takes the later end too', () => {
  const lateEnd = () => 18 * 60 + 30
  assert.equal(workOverlapMinutes(at(5, 18), at(5, 20), makeIsWorkday(), lateEnd), 30)
  assert.equal(workOverlapMinutes(at(5, 18), at(5, 20)), 0)
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
