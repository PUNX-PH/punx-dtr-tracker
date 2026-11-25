// node tests/otTypes.test.mjs — OT types per the DTR guidelines sheet. The
// examples below are the ones written in that sheet.
import assert from 'node:assert/strict'
import { classifyOT, typeLines, otSessions, OT_TYPE_LINES } from '../src/services/otTypes.js'
import { makeDayKind } from '../src/services/workday.js'

let pass = 0, fail = 0
function it(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); pass++ }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message.split('\n')[0]}`); fail++ }
}
// October 2026: 5 Mon, 6 Tue, 7 Wed, 8 Thu, 9 Fri, 10 Sat, 11 Sun.
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m)
const ot = (d, h1, m1, d2, h2, m2, session = 0) => [
  { type: 'OT_IN', timestamp: at(d, h1, m1), session },
  { type: 'OT_OUT', timestamp: at(d2, h2, m2), session },
]
const reg = (d, h1, m1, h2, m2) => [{ type: 'IN', timestamp: at(d, h1, m1) }, { type: 'OUT', timestamp: at(d, h2, m2) }]
const holidays = {
  '2026-10-06': [{ type: 'regular', name: 'Regular Day' }],
  '2026-10-07': [{ type: 'special', name: 'Special Day' }],
  '2026-10-08': [{ type: 'company', payAs: 'regular', name: 'Co as regular' }],
  '2026-10-09': [{ type: 'company', payAs: 'special', name: 'Co as special' }],
  '2026-10-12': [{ type: 'company', payAs: 'rest', name: 'Co as rest' }],
  '2026-10-13': [{ type: 'company', name: 'Co unset' }],
}
const dayKind = makeDayKind(holidays)
const m = (logs, opts = { dayKind }) => classifyOT(logs, opts).minutes
const only = (minutes) => Object.fromEntries(Object.entries(minutes).filter(([, v]) => v > 0))

console.log('\nregular days')
it('Regular OT: 6:00 PM to 9:00 PM = 3 hours', () => assert.deepEqual(only(m(ot(5, 18, 0, 5, 21, 0))), { regularOT: 180 }))
it('Regular OT with ND: 6:00 PM to 11:00 PM = 4 hours Regular OT + 1 hour with ND', () =>
  assert.deepEqual(only(m(ot(5, 18, 0, 5, 23, 0))), { regularOT: 240, regularOTND: 60 }))
it('6:00 PM to 2:00 AM is 8 hours elapsed, less the 1-hour break = 7 counted, with the break before ND: 3 + 4', () => {
  const r = m(ot(5, 18, 0, 5, 2, 0))
  assert.deepEqual(only(r), { regularOT: 180, regularOTND: 240 })
  assert.equal(r.regularOT + r.regularOTND, 420)
})
it('ND is part of the overtime, not on top: 3 hours Regular OT + 4 hours with ND is 7 hours in all', () => {
  const t = classifyOT(ot(5, 18, 0, 5, 2, 0), { dayKind })
  assert.equal(t.total, 420)
})
it('a session of exactly 5 hours gets no break; 5 hours and a minute does', () => {
  assert.equal(classifyOT(ot(5, 18, 0, 5, 23, 0), { dayKind }).total, 300)
  assert.equal(classifyOT(ot(5, 18, 0, 5, 23, 1), { dayKind }).total, 241)
})
it('when there are not enough non-ND minutes the break comes off ND ones: 11 PM to 6 AM', () =>
  assert.deepEqual(only(m(ot(5, 23, 0, 5, 6, 0))), { regularOTND: 360 }))
it('the regular Time In/Out on a workday is not overtime', () => assert.equal(classifyOT(reg(5, 9, 0, 18, 0), { dayKind }).total, 0))
it('the part of a session inside 9 to 6 is left out', () => assert.deepEqual(only(m(ot(5, 17, 0, 5, 20, 0))), { regularOT: 120 }))
it('split sessions are separate: two 3-hour sessions get no break', () =>
  assert.deepEqual(only(m([...ot(5, 18, 0, 5, 21, 0, 0), ...ot(5, 22, 0, 5, 23, 59, 1)])), { regularOT: 180, regularOTND: 119 }))
it('an incomplete session counts for nothing', () =>
  assert.equal(classifyOT([{ type: 'OT_IN', timestamp: at(5, 18, 0) }], { dayKind }).total, 0))

console.log('\nrest days')
it('Rest Day Work: Saturday 9:00 AM to 2:00 PM = 5 hours', () => assert.deepEqual(only(m(reg(10, 9, 0, 14, 0))), { restDayWork: 300 }))
it('Rest Day OT: Saturday 9:00 AM to 7:00 PM with the break = 9 actual hours, 1 hour of RD OT', () =>
  assert.deepEqual(only(m(reg(10, 9, 0, 19, 0))), { restDayWork: 480, restDayOT: 60 }))
it('RD OT with ND: the overtime inside 10 PM to 6 AM is flagged apart', () => {
  // 9-6 regular (8 actual hours of work) then an OT session 6 PM to 11 PM
  const r = m([...reg(10, 9, 0, 18, 0), ...ot(10, 18, 0, 10, 23, 0)])
  assert.deepEqual(only(r), { restDayWork: 480, restDayOT: 240, restDayOTND: 60 })
})
it('Sunday is a rest day too', () => assert.deepEqual(only(m(reg(11, 9, 0, 12, 0))), { restDayWork: 180 }))
it('on a rest day an OT session adds to the work: 5 hours regular + a 3-hour session is all Work', () =>
  assert.deepEqual(only(m([...reg(10, 9, 0, 14, 0), ...ot(10, 18, 0, 10, 21, 0)])), { restDayWork: 480 }))

console.log('\nholidays')
it('Regular Holiday Work / OT: the first 8 hours, then the excess', () =>
  assert.deepEqual(only(m(reg(6, 9, 0, 19, 0))), { regularHolidayWork: 480, regularHolidayOT: 60 }))
it('Special Holiday Work / OT likewise', () =>
  assert.deepEqual(only(m(reg(7, 9, 0, 19, 0))), { specialHolidayWork: 480, specialHolidayOT: 60 }))
it('Holiday work with ND shows the holiday type and flags the ND hours', () => {
  assert.deepEqual(only(m(ot(6, 22, 0, 6, 2, 0))), { regularHolidayND: 240 })
  assert.deepEqual(only(m(ot(7, 22, 0, 7, 2, 0))), { specialHolidayND: 240 })
})
it('a holiday beats a rest day: a Regular Holiday that falls on a Saturday is a holiday', () => {
  const k = makeDayKind({ '2026-10-10': [{ type: 'regular' }] })
  assert.deepEqual(only(m(reg(10, 9, 0, 14, 0), { dayKind: k })), { regularHolidayWork: 300 })
})

console.log('\ncompany holidays are paid as the super admin set them')
it('as a regular holiday', () => assert.deepEqual(only(m(reg(8, 9, 0, 14, 0))), { regularHolidayWork: 300 }))
it('as a special holiday', () => assert.deepEqual(only(m(reg(9, 9, 0, 14, 0))), { specialHolidayWork: 300 }))
it('as a rest day', () => assert.deepEqual(only(m(reg(12, 9, 0, 14, 0))), { restDayWork: 300 }))
it('with nothing set it is a rest day', () => assert.deepEqual(only(m(reg(13, 9, 0, 14, 0))), { restDayWork: 300 }))

console.log('\nthe breakdown')
it('lists only the lines with hours, in the guideline order', () => {
  const t = classifyOT([...ot(5, 18, 0, 5, 23, 0), ...reg(10, 9, 0, 14, 0), ...reg(6, 9, 0, 19, 0)], { dayKind })
  assert.deepEqual(typeLines(t).map(l => l.label), ['Regular OT', 'Regular OT with ND', 'Rest Day Work', 'Regular Holiday Work', 'Regular Holiday OT'])
  assert.equal(OT_TYPE_LINES.length, 11)
})
it('no logs is no lines', () => assert.deepEqual(typeLines(classifyOT([])), []))
it('works from ISO strings as the api returns them', () =>
  assert.equal(classifyOT([{ type: 'OT_IN', timestamp: at(5, 18, 0).toISOString() }, { type: 'OT_OUT', timestamp: at(5, 20, 0).toISOString() }], { dayKind }).total, 120))
it('otSessions reads the same sessions the OT total does', () => {
  const s = otSessions([...ot(5, 18, 0, 5, 2, 0), { type: 'OT_IN', timestamp: at(7, 18, 0), session: 0 }])
  assert.deepEqual(s.map(x => [x.day, x.problem, x.elapsed]), [['2026-10-05', null, 480], ['2026-10-07', 'no-end', 0]])
})

console.log('\nregular time past 6 PM')
it('regular Time out 6:30 PM: OT filed from 6:00 PM counts from 6:30', () =>
  assert.deepEqual(only(m([...reg(5, 9, 0, 18, 30), ...ot(5, 18, 0, 5, 20, 0)])), { regularOT: 90 }))
it('the same day with no OT filed has no OT at all', () => assert.equal(classifyOT(reg(5, 9, 0, 18, 30), { dayKind }).total, 0))
it('a session reads the day note as its reason when it has none of its own', () => {
  const s = otSessions([{ type: 'OT_IN', timestamp: at(5, 18, 0), reason: 'Month end' }, { type: 'OT_OUT', timestamp: at(5, 20, 0), reason: 'Month end' }])
  assert.equal(s[0].reason, 'Month end')
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
