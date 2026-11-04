// node tests/time.test.mjs — the hour/minute/AM-PM <-> "HH:MM" conversion behind
// the DTR time dropdowns. The cases that matter are the 12s and midnight: 12 AM
// is 00:xx, 12 PM is 12:xx, and a late-night entry must never read back as 24:xx.
import assert from 'node:assert/strict'
import { parseTime, toTime24, isComplete, isEmpty, formatHHMM } from '../src/services/time.js'

let pass = 0, fail = 0
function it(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); pass++ }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message.split('\n')[0]}`); fail++ }
}

console.log('\nparseTime')
it('afternoon', () => assert.deepEqual(parseTime('21:05'), { h: '9', m: '05', p: 'PM' }))
it('morning', () => assert.deepEqual(parseTime('09:00'), { h: '9', m: '00', p: 'AM' }))
it('midnight is 12 AM', () => assert.deepEqual(parseTime('00:30'), { h: '12', m: '30', p: 'AM' }))
it('noon is 12 PM', () => assert.deepEqual(parseTime('12:00'), { h: '12', m: '00', p: 'PM' }))
it('11:59 PM', () => assert.deepEqual(parseTime('23:59'), { h: '11', m: '59', p: 'PM' }))
it('empty / junk / out of range is blank, not a crash', () => {
  for (const v of ['', null, undefined, 'abc', '24:00', '12:60']) assert.deepEqual(parseTime(v), { h: '', m: '', p: '' })
})

console.log('\ntoTime24')
it('9 PM is 21:00, not 09:00 (the Safari bug)', () => assert.equal(toTime24({ h: '9', m: '00', p: 'PM' }), '21:00'))
it('9 AM is 09:00', () => assert.equal(toTime24({ h: '9', m: '00', p: 'AM' }), '09:00'))
it('12 AM is 00:xx', () => assert.equal(toTime24({ h: '12', m: '15', p: 'AM' }), '00:15'))
it('12 PM is 12:xx', () => assert.equal(toTime24({ h: '12', m: '15', p: 'PM' }), '12:15'))
it('every minute of the day round-trips', () => {
  for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m++) {
    const v = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    assert.equal(toTime24(parseTime(v)), v)
  }
})

console.log('\ncompleteness (what the parent is allowed to hear)')
it('only all three parts is complete', () => {
  assert.equal(isComplete({ h: '9', m: '00', p: 'PM' }), true)
  assert.equal(isComplete({ h: '9', m: '00', p: '' }), false)
  assert.equal(isComplete({ h: '', m: '', p: 'PM' }), false)
})
it('only all-blank is empty; half-picked is neither', () => {
  assert.equal(isEmpty({ h: '', m: '', p: '' }), true)
  const half = { h: '9', m: '', p: '' }
  assert.equal(isEmpty(half), false); assert.equal(isComplete(half), false)
})

console.log('\nformatHHMM')
it('midnight hour is 00, never 24', () => {
  assert.equal(formatHHMM(new Date(2026, 9, 30, 0, 5)), '00:05')
  assert.equal(formatHHMM(new Date(2026, 9, 30, 23, 59)), '23:59')
  assert.equal(formatHHMM(new Date(2026, 9, 30, 9, 0)), '09:00')
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
