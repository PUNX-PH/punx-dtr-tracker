// node tests/deadline.test.mjs — the DTR submission deadline: when it is, and where a person stands.
import assert from 'node:assert/strict'
import { deadlineFor, deadlineState, overdueRecipients, periodText, spanText, deadlineText } from '../src/services/deadline.js'

let pass = 0, fail = 0
function it(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); pass++ }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message.split('\n')[0]}`); fail++ }
}
const ts = (d) => ({ toDate: () => d }) // a Firestore Timestamp
const at = (m, d, h = 0, min = 0) => new Date(2026, m - 1, d, h, min) // month is 1-based here

// the usual periods: 11th–25th is due the 26th, 26th–10th is due the 11th
const mid = { id: 'c1', startDate: ts(at(11, 11)), endDate: ts(at(11, 25)), submitBy: ts(at(11, 26, 10)) }
const noDeadlineStored = { id: 'c2', startDate: ts(at(11, 26)), endDate: ts(at(12, 10)), submitBy: null }

console.log('\nwhen it is due')
it('uses the stored deadline', () => assert.deepEqual(deadlineFor(mid), at(11, 26, 10)))
it('with none stored it is 10:00 AM the day after the period ends: the 11th', () => assert.deepEqual(deadlineFor(noDeadlineStored), at(12, 11, 10)))
it('the day after the 25th is the 26th', () => assert.deepEqual(deadlineFor({ endDate: ts(at(11, 25)) }), at(11, 26, 10)))
it('a stored deadline that was moved (a holiday) wins over the usual one', () =>
  assert.deepEqual(deadlineFor({ ...mid, submitBy: ts(at(11, 27, 10)) }), at(11, 27, 10)))
it('nothing to go on is null, not a guess', () => { assert.equal(deadlineFor(null), null); assert.equal(deadlineFor({}), null) })

console.log('\nwhere someone stands')
const state = (now, submission) => deadlineState({ cutoff: mid, submission, now })
it('the day before: not yet the day', () => assert.equal(state(at(11, 25, 15)).phase, 'before'))
it('the 26th before 10 AM: due today, with the time left', () => {
  const s = state(at(11, 26, 7, 30))
  assert.equal(s.phase, 'due-today'); assert.equal(s.msLeft, 150 * 60000)
})
it('the 26th just before 10:00 is still due today; at 10:01 it is overdue', () => {
  assert.equal(state(at(11, 26, 9, 59)).phase, 'due-today')
  const late = state(at(11, 26, 10, 1))
  assert.equal(late.phase, 'overdue'); assert.equal(late.msLate, 60000)
})
it('the days after are overdue', () => assert.equal(state(at(11, 28, 9)).phase, 'overdue'))
it('once submitted it is done, whatever the time', () => {
  assert.equal(state(at(11, 26, 7), { status: 'pending' }).phase, 'done')
  assert.equal(state(at(11, 29, 7), { status: 'approved' }).phase, 'done')
})
it('a rejected DTR is not done — it has to be redone', () => assert.equal(state(at(11, 29, 7), { status: 'rejected' }).phase, 'overdue'))
it('no cutoff, no reminder', () => assert.equal(deadlineState({ cutoff: null, now: at(11, 26, 7) }).phase, 'none'))

console.log('\nwho is told')
const users = [{ id: 'a' }, { id: 'b' }, { id: 'c', removed: true }, { id: 'd' }]
it('everyone current with nothing sent, never the removed or those who sent one', () => {
  assert.deepEqual(overdueRecipients(users, { a: { status: 'pending' } }).map(u => u.id), ['b', 'd'])
  assert.deepEqual(overdueRecipients(users, [{ userId: 'b' }, { userId: 'd' }]).map(u => u.id), ['a'])
})
it('someone with a rejected DTR is not in the list: they already have a notice to redo it', () =>
  assert.deepEqual(overdueRecipients(users, { a: { status: 'rejected' } }).map(u => u.id), ['b', 'd']))

console.log('\nthe words')
it('a period, a deadline and a span read plainly', () => {
  assert.equal(periodText(mid), 'Nov 11 – Nov 25')
  assert.equal(deadlineText(at(11, 26, 10)), 'Thu, Nov 26 at 10:00 AM')
  assert.equal(spanText(150 * 60000), '2 hrs 30 mins'); assert.equal(spanText(-5), '0 mins')
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
