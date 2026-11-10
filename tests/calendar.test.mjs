// node tests/calendar.test.mjs — holidays, department scope, attendance status
// and the month grid. No Firebase: these are the rules the Department Calendar,
// Attendance and Leave history screens all lean on.
import assert from 'node:assert/strict'
import { easterSunday, phHolidays, mergeHolidays, holidaysByDate, holidaysForYears, HOLIDAY_TYPES, spanDays, MAX_SPAN_DAYS } from '../src/services/holidays.js'
import { deriveManaged, scopeFor, inScope, usersInScope, orgFields, orgTitle, departmentsInScope } from '../src/services/org.js'
import { DAY_STATUS, workedDays, isLate, dayStatus, classifyRange, summarizeDays } from '../src/services/attendance.js'
import { monthGrid, monthBounds, addMonths, leavesOnDate, eventsForDate, calendarEventFrom } from '../src/services/calendar.js'
import { toYMD, canUseDepartment, LEAVE_TYPES } from '../src/services/leave.js'

let pass = 0, fail = 0
function it(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); pass++ }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message.split('\n')[0]}`); fail++ }
}

console.log('\nEaster (the anchor for Holy Week)')
it('known Easter Sundays', () => {
  assert.equal(toYMD(easterSunday(2025)), '2025-04-20')
  assert.equal(toYMD(easterSunday(2026)), '2026-04-05')
  assert.equal(toYMD(easterSunday(2027)), '2027-03-28')
})

console.log('\ncolours the calendar legend relies on')
it('no holiday type shares a colour with a leave type, and none repeat', () => {
  const colours = [...Object.values(HOLIDAY_TYPES), ...Object.values(LEAVE_TYPES)].map(t => t.color)
  assert.equal(new Set(colours).size, colours.length)
})
it('a holiday on the attendance strip is not drawn in the Offset colour', () =>
  assert.notEqual(DAY_STATUS.holiday.color, DAY_STATUS.offset.color))

console.log('\nbuilt-in Philippine holidays')
const byName = (year) => Object.fromEntries(phHolidays(year).map(h => [h.name, h.date]))
it('2026 Holy Week follows Easter (Apr 5)', () => {
  const h = byName(2026)
  assert.equal(h['Maundy Thursday'], '2026-04-02')
  assert.equal(h['Good Friday'], '2026-04-03')
  assert.equal(h['Black Saturday'], '2026-04-04')
})
it('National Heroes Day is the last Monday of August', () => {
  assert.equal(byName(2026)['National Heroes Day'], '2026-08-31')
  assert.equal(byName(2027)['National Heroes Day'], '2027-08-30')
})
it('fixed-date holidays land on their dates', () => {
  const h = byName(2026)
  assert.equal(h["New Year's Day"], '2026-01-01')
  assert.equal(h['Independence Day'], '2026-06-12')
  assert.equal(h['Bonifacio Day'], '2026-11-30')
  assert.equal(h['Christmas Day'], '2026-12-25')
  assert.equal(h['Rizal Day'], '2026-12-30')
})
it('the year-specific proclamations are only where we know them', () => {
  assert.equal(byName(2026)['Chinese New Year'], '2026-02-17')
  assert.equal(byName(2030)['Chinese New Year'], undefined)
})
it('every year gets a sorted list with unique ids, even years nobody listed', () => {
  for (const y of [2026, 2031]) {
    const list = phHolidays(y)
    assert.equal(new Set(list.map(h => h.id)).size, list.length)
    assert.deepEqual(list.map(h => h.date), [...list.map(h => h.date)].sort())
  }
})
it('Eid is NOT guessed — it is moon-sighted, so HR adds it', () =>
  assert.ok(!phHolidays(2026).some(h => /eid/i.test(h.name))))

console.log('\nHR edits on top of the built-in list')
const base = phHolidays(2026)
it('a company holiday is added', () => {
  const m = mergeHolidays(base, [{ id: 'abc', date: '2026-07-10', name: 'Company Day', type: 'company' }])
  assert.equal(m.find(h => h.id === 'abc').source, 'company')
  assert.equal(m.length, base.length + 1)
})
it('a stored ph- doc overrides the built-in one (rename / move)', () => {
  const m = mergeHolidays(base, [{ id: 'ph-2026-06-12', date: '2026-06-13', name: 'Independence Day (moved)', type: 'regular' }])
  assert.equal(m.find(h => h.id === 'ph-2026-06-12').date, '2026-06-13')
  assert.equal(m.find(h => h.id === 'ph-2026-06-12').source, 'ph-edited')
  assert.equal(m.length, base.length)
})
it('hidden removes a built-in holiday and stays removed', () => {
  const m = mergeHolidays(base, [{ id: 'ph-2026-11-01', hidden: true }])
  assert.ok(!m.some(h => h.id === 'ph-2026-11-01'))
})
it('a malformed stored doc is ignored, not a crash', () => {
  const m = mergeHolidays(base, [{ id: 'x', date: 'nope', type: 'company' }, { id: 'y', date: '2026-05-05', type: 'bogus' }, null])
  assert.equal(m.length, base.length)
})
it('two holidays on one date both show', () => {
  const m = mergeHolidays(base, [{ id: 'c1', date: '2026-12-25', name: 'Office Party', type: 'company' }])
  assert.equal(holidaysByDate(m)['2026-12-25'].length, 2)
})
it('a view that spans New Year gets both years', () => {
  const m = holidaysForYears([2026, 2027, 2026], [])
  assert.ok(m.some(h => h.date === '2026-12-25') && m.some(h => h.date === '2027-01-01'))
})

console.log('\nholidays that repeat every year')
const company = (o) => ({ id: 'co1', date: '2026-07-10', name: 'Foundation Day', type: 'company', ...o })
const yearsOf = (list, name) => list.filter(h => h.name === name).map(h => h.date)
it('a repeating holiday lands on the same date every year from its first year', () => {
  const m = holidaysForYears([2026, 2027, 2028], [company({ recurring: true })])
  assert.deepEqual(yearsOf(m, 'Foundation Day'), ['2026-07-10', '2027-07-10', '2028-07-10'])
})
it('...and never before the year it starts', () => {
  const m = holidaysForYears([2024, 2025, 2026], [company({ recurring: true })])
  assert.deepEqual(yearsOf(m, 'Foundation Day'), ['2026-07-10'])
})
it('each occurrence has its own id but they all point at the one stored doc', () => {
  const m = holidaysForYears([2026, 2027], [company({ recurring: true })]).filter(h => h.name === 'Foundation Day')
  assert.deepEqual(m.map(h => h.id), ['co1@2026', 'co1@2027'])
  assert.ok(m.every(h => h.seriesId === 'co1' && h.recurring === true))
})
it('turning the repeat off leaves only the first year', () => {
  const m = holidaysForYears([2026, 2027, 2028], [company({ recurring: false })])
  assert.deepEqual(yearsOf(m, 'Foundation Day'), ['2026-07-10'])
  assert.equal(m.find(h => h.name === 'Foundation Day').id, 'co1')
})
it('a 29 Feb holiday falls on 28 Feb in a year with no 29th', () => {
  const m = holidaysForYears([2028, 2029], [company({ date: '2028-02-29', recurring: true })])
  assert.deepEqual(yearsOf(m, 'Foundation Day'), ['2028-02-29', '2029-02-28'])
})
it('a built-in override never repeats — the built-in list already generates every year', () => {
  const m = holidaysForYears([2026, 2027], [{ id: 'ph-2026-06-12', date: '2026-06-13', name: 'Independence Day (moved)', type: 'regular', recurring: true }])
  assert.deepEqual(yearsOf(m, 'Independence Day (moved)'), ['2026-06-13'])
  assert.ok(m.some(h => h.date === '2027-06-12' && h.name === 'Independence Day'))
})
it('without a year list a repeating doc is just its own date (no surprise expansion)', () =>
  assert.deepEqual(yearsOf(mergeHolidays([], [company({ recurring: true })]), 'Foundation Day'), ['2026-07-10']))

console.log('\nholidays that last several days')
it('spanDays counts both ends, and treats a bad range as one day', () => {
  assert.equal(spanDays('2026-12-24', '2026-12-26'), 3)
  assert.equal(spanDays('2026-12-24', '2026-12-24'), 1)
  assert.equal(spanDays('2026-12-24', ''), 1)
  assert.equal(spanDays('2026-12-24', '2026-12-20'), 1)
})
it('a multi-day holiday is on every day it covers, numbered', () => {
  const m = holidaysByDate(mergeHolidays([], [company({ endDate: '2026-07-13' })]))
  const days = ['2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13']
  assert.deepEqual(days.map(d => (m[d] || []).length), [1, 1, 1, 1])
  assert.deepEqual(days.map(d => `${m[d][0].day}/${m[d][0].days}`), ['1/4', '2/4', '3/4', '4/4'])
  assert.equal(m['2026-07-14'], undefined)
})
it('an end date before the start is ignored rather than breaking the calendar', () => {
  const m = holidaysByDate(mergeHolidays([], [company({ endDate: '2026-07-01' })]))
  assert.deepEqual(Object.keys(m), ['2026-07-10'])
})
it('a repeating multi-day holiday keeps its length each year, across New Year', () => {
  const list = holidaysForYears([2026, 2027], [company({ date: '2026-12-30', endDate: '2027-01-02', recurring: true, name: 'Year-end break' })])
  const mine = list.filter(h => h.name === 'Year-end break')
  assert.deepEqual(mine.map(h => [h.date, h.endDate, h.days]), [['2026-12-30', '2027-01-02', 4], ['2027-12-30', '2028-01-02', 4]])
  const byDate = holidaysByDate(list)
  assert.ok(byDate['2027-01-01'].some(h => h.name === 'Year-end break'))
})
it('a span is capped so a typo cannot paint months', () => {
  const m = holidaysByDate(mergeHolidays([], [company({ endDate: '2030-07-10' })]))
  assert.equal(Object.keys(m).length, MAX_SPAN_DAYS)
})
it('a built-in override may be stretched over several days', () => {
  const m = holidaysByDate(holidaysForYears([2026], [{ id: 'ph-2026-04-02', date: '2026-04-02', endDate: '2026-04-05', name: 'Holy Week', type: 'regular' }]))
  assert.deepEqual(['2026-04-02', '2026-04-03', '2026-04-04', '2026-04-05'].map(d => (m[d] || []).some(h => h.name === 'Holy Week')), [true, true, true, true])
})

console.log('\nwho can see whom')
const DEPTS = [{ id: 'eng', name: 'Engineering' }, { id: 'ops', name: 'Operations' }, { id: 'hr', name: 'HR' }]
it('a manager covers their own department only', () =>
  assert.deepEqual(deriveManaged({ departmentId: 'eng', isManager: true }), ['eng']))
it('a director covers the departments listed for them', () =>
  assert.deepEqual(deriveManaged({ departmentId: 'hr', isDirector: true, directorDepartmentIds: ['eng', 'ops'] }), ['eng', 'ops']))
it('manager + director de-duplicates', () =>
  assert.deepEqual(deriveManaged({ departmentId: 'eng', isManager: true, isDirector: true, directorDepartmentIds: ['eng', 'ops'] }), ['eng', 'ops']))
it('flags off, or a director with no list, manages nothing', () => {
  assert.deepEqual(deriveManaged({ departmentId: 'eng' }), [])
  assert.deepEqual(deriveManaged({ departmentId: 'eng', isDirector: true }), [])
  assert.deepEqual(deriveManaged({ isManager: true }), []) // a manager with no department of their own
})
it('HR and admins are company-wide', () => {
  assert.equal(scopeFor({ role: 'admin' }).all, true)
  assert.equal(scopeFor({ role: 'super_admin' }).all, true)
})
it('managers and directors are scoped; everyone else is none', () => {
  assert.deepEqual(scopeFor({ role: 'employee', managedDepartmentIds: ['eng'] }).departmentIds, ['eng'])
  assert.equal(scopeFor({ role: 'employee' }).none, true)
  assert.equal(scopeFor({ role: 'employee', isSenior: true }).none, true) // seniors approve; they are not managers
  assert.equal(scopeFor(null).none, true)
})
it('inScope: a department outside the scope is refused, and a person with no department is HR-only', () => {
  const s = scopeFor({ role: 'employee', managedDepartmentIds: ['eng'] })
  assert.equal(inScope(s, 'eng'), true)
  assert.equal(inScope(s, 'ops'), false)
  assert.equal(inScope(s, ''), false)
  assert.equal(inScope(s, undefined), false)
  assert.equal(inScope(scopeFor({ role: 'admin' }), ''), true)
})
it('usersInScope drops people who left', () => {
  const users = [
    { id: 'a', departmentId: 'eng' }, { id: 'b', departmentId: 'ops' },
    { id: 'c', departmentId: 'eng', removed: true }, { id: 'd' },
  ]
  assert.deepEqual(usersInScope(scopeFor({ role: 'employee', managedDepartmentIds: ['eng'] }), users).map(u => u.id), ['a'])
  assert.deepEqual(usersInScope(scopeFor({ role: 'admin' }), users).map(u => u.id), ['a', 'b', 'd'])
})
it('a manager only gets their own departments in a filter', () =>
  assert.deepEqual(departmentsInScope(scopeFor({ role: 'employee', managedDepartmentIds: ['ops'] }), DEPTS).map(d => d.id), ['ops']))
it('orgFields stores the derived list, and clears director ids when the flag goes off', () => {
  const f = orgFields({ departmentId: 'eng', isManager: true, isDirector: false, directorDepartmentIds: ['ops'] })
  assert.deepEqual(f.managedDepartmentIds, ['eng'])
  assert.deepEqual(f.directorDepartmentIds, [])
})
it('titles', () => {
  assert.equal(orgTitle({ isManager: true, isDirector: true }), 'Manager · Director')
  assert.equal(orgTitle({}), '')
})

console.log('\nattendance')
const at = (ymd, h, m, type = 'IN') => { const [y, mo, d] = ymd.split('-').map(Number); return { type, timestamp: new Date(y, mo - 1, d, h, m) } }
it('only real time entries count as having worked', () => {
  const w = workedDays([{ type: 'EDIT', timestamp: new Date(2026, 9, 5, 9, 0) }, { type: 'REASON', timestamp: new Date(2026, 9, 5, 9, 0) }])
  assert.deepEqual(w, {})
})
it('first IN of the day decides lateness; OUT alone still counts as present', () => {
  const w = workedDays([at('2026-10-05', 9, 20), at('2026-10-05', 8, 55), at('2026-10-06', 18, 0, 'OUT')])
  assert.equal(isLate(w['2026-10-05'].firstIn), false) // 8:55 is the first IN
  assert.equal(w['2026-10-06'].worked, true)
})
it('9:00 is on time, 9:01 is late', () => {
  assert.equal(isLate(new Date(2026, 9, 5, 9, 0)), false)
  assert.equal(isLate(new Date(2026, 9, 5, 9, 1)), true)
})
const TODAY = '2026-10-14'
const status = (o) => dayStatus({ today: TODAY, ...o })
it('a past weekday with nothing on it is just "no entry" — there is no absent status', () => {
  assert.equal(status({ ymd: '2026-10-07' }), 'noentry')
  assert.ok(!('absent' in DAY_STATUS))
})
it('today is never "no entry" — the day is not over', () => assert.equal(status({ ymd: TODAY }), 'upcoming'))
it('weekends stay weekends', () => assert.equal(status({ ymd: '2026-10-10' }), 'weekend'))
it('a holiday is a holiday', () => assert.equal(status({ ymd: '2026-10-07', holiday: { name: 'X' } }), 'holiday'))
it('approved leave is leave / offset', () => {
  assert.equal(status({ ymd: '2026-10-07', leave: { type: 'sick' } }), 'leave')
  assert.equal(status({ ymd: '2026-10-07', leave: { type: 'offset' } }), 'offset')
})
it('working on a day trumps leave and holiday', () => {
  const worked = { firstIn: new Date(2026, 9, 7, 9, 0), worked: true }
  assert.equal(status({ ymd: '2026-10-07', worked, leave: { type: 'sick' } }), 'present')
  assert.equal(status({ ymd: '2026-10-07', worked, holiday: { name: 'X' } }), 'present')
})
it('late only on a normal working day', () => {
  const worked = { firstIn: new Date(2026, 9, 7, 10, 0), worked: true }
  assert.equal(status({ ymd: '2026-10-07', worked }), 'late')
  assert.equal(status({ ymd: '2026-10-07', worked, holiday: { name: 'X' } }), 'present')
})
it('classifyRange + summarizeDays over a real week', () => {
  const logs = [at('2026-10-05', 9, 0), at('2026-10-06', 9, 30), at('2026-10-08', 9, 0)] // Mon on time, Tue late, Thu on time
  const leaves = [{ status: 'approved', type: 'sick', startDate: '2026-10-07', endDate: '2026-10-07' }] // Wed
  const hol = { '2026-10-09': [{ name: 'Test Holiday' }] } // Fri
  const days = classifyRange({ startYMD: '2026-10-05', endYMD: '2026-10-11', logs, leaves, holidaysByDate: hol, today: TODAY })
  assert.deepEqual(days.map(d => d.status), ['present', 'late', 'leave', 'present', 'holiday', 'weekend', 'weekend'])
  const s = summarizeDays(days)
  assert.equal(s.attended, 3); assert.equal(s.late, 1); assert.equal(s.leave, 1); assert.equal(s.holiday, 1); assert.equal(s.noentry, 0)
  assert.ok(!('absent' in s)); assert.ok(!('attendanceRate' in s))
})
it('a working day with nothing on it counts as no entry, not as anything worse', () => {
  const days = classifyRange({ startYMD: '2026-10-05', endYMD: '2026-10-06', logs: [at('2026-10-05', 9, 0)], leaves: [], today: TODAY })
  const s = summarizeDays(days)
  assert.equal(s.noentry, 1); assert.equal(s.attended, 1)
})
it('local time: a 9 AM clock-in lands on that calendar day, not the UTC one', () => {
  const w = workedDays([at('2026-10-05', 0, 30)]) // 12:30 AM local is the previous day in UTC east of Greenwich
  assert.ok(w['2026-10-05'])
})

console.log('\nthe Department tab is still in testing')
it('super admins only while the master switch is on', () => {
  assert.equal(canUseDepartment({ role: 'super_admin' }, true), true)
  for (const role of ['admin', 'employee']) assert.equal(canUseDepartment({ role }, true), false)
  assert.equal(canUseDepartment({ role: 'employee', isManager: true, managedDepartmentIds: ['eng'] }, true), false) // managers wait for the release too
  assert.equal(canUseDepartment(null, true), false)
})
it('hidden from everyone when the switch is off', () =>
  assert.equal(canUseDepartment({ role: 'super_admin' }, false), false))

console.log('\ncalendar grid')
it('October 2026 starts on a Thursday and pads to whole weeks', () => {
  const g = monthGrid(2026, 9)
  assert.equal(g.length % 7, 0)
  assert.equal(g.find(c => c.inMonth).ymd, '2026-10-01')
  assert.equal(g.indexOf(g.find(c => c.inMonth)), 4) // Sun-first: Thu = column 4
  assert.equal(g.filter(c => c.inMonth).length, 31)
})
it('a month that fits exactly in four weeks still renders whole rows (Feb 2026)', () => {
  const g = monthGrid(2026, 1)
  assert.equal(g.length, 28)
  assert.ok(g.every(c => c.inMonth))
})
it('addMonths rolls the year both ways', () => {
  assert.deepEqual(addMonths({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 })
  assert.deepEqual(addMonths({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 })
})
it('monthBounds', () => assert.deepEqual(monthBounds(2026, 1), { start: '2026-02-01', end: '2026-02-28' }))
const ev = (o) => ({ userId: 'u', userName: 'U', type: 'sick', startDate: '2026-10-16', endDate: '2026-10-19', ...o })
it('a Fri–Mon leave paints Fri and Mon, not the weekend', () => {
  const e = [ev({})]
  assert.equal(leavesOnDate(e, '2026-10-16').length, 1)
  assert.equal(leavesOnDate(e, '2026-10-17').length, 0)
  assert.equal(leavesOnDate(e, '2026-10-18').length, 0)
  assert.equal(leavesOnDate(e, '2026-10-19').length, 1)
})
it('eventsForDate bundles holidays and leave for the day', () => {
  const out = eventsForDate('2026-10-16', {
    holidaysByDate: { '2026-10-16': [{ name: 'H' }] },
    leaves: [ev({})],
  })
  assert.equal(out.holidays.length, 1); assert.equal(out.leaves.length, 1)
  assert.ok(!('absences' in out))
})
it('the calendar event copied from a request carries no reason', () => {
  const e = calendarEventFrom({ userId: 'u', userName: 'U', type: 'sick', startDate: 'a', endDate: 'b', reason: 'chemo', reviewNote: 'x' })
  assert.ok(!('reason' in e)); assert.ok(!('reviewNote' in e))
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
