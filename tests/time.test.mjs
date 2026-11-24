// node tests/time.test.mjs — the hour/minute/AM-PM <-> "HH:MM" conversion behind
// the DTR time dropdowns. The cases that matter are the 12s and midnight: 12 AM
// is 00:xx, 12 PM is 12:xx, and a late-night entry must never read back as 24:xx.
import assert from 'node:assert/strict'
import { parseTime, toTime24, isComplete, isEmpty, formatHHMM, parseTypedTime, formatClock, stepTime24, formatTypedDigits } from '../src/services/time.js'

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

console.log('\ntyping a time')
const t = (x) => parseTypedTime(x)
it('hour and minutes with a colon, with or without am/pm', () => {
  assert.deepEqual(t('9:30'), { h: '9', m: '30', p: '' })
  assert.deepEqual(t('9:30pm'), { h: '9', m: '30', p: 'PM' })
  assert.deepEqual(t('9:30 AM'), { h: '9', m: '30', p: 'AM' })
  assert.deepEqual(t('  11:05 p.m. '), { h: '11', m: '05', p: 'PM' })
})
it('just the hour, or digits with no colon', () => {
  assert.deepEqual(t('9'), { h: '9', m: '00', p: '' })
  assert.deepEqual(t('9pm'), { h: '9', m: '00', p: 'PM' })
  assert.deepEqual(t('9p'), { h: '9', m: '00', p: 'PM' })
  assert.deepEqual(t('12'), { h: '12', m: '00', p: '' })
  assert.deepEqual(t('930'), { h: '9', m: '30', p: '' })
  assert.deepEqual(t('0930'), { h: '9', m: '30', p: '' })
  assert.deepEqual(t('1230am'), { h: '12', m: '30', p: 'AM' })
})
it('24-hour times know their AM/PM', () => {
  assert.deepEqual(t('21:30'), { h: '9', m: '30', p: 'PM' })
  assert.deepEqual(t('2130'), { h: '9', m: '30', p: 'PM' })
  assert.deepEqual(t('13'), { h: '1', m: '00', p: 'PM' })
  assert.deepEqual(t('0:30'), { h: '12', m: '30', p: 'AM' })
  assert.deepEqual(t('00:00'), { h: '12', m: '00', p: 'AM' })
})
it('things that are not times', () => {
  for (const bad of ['', '   ', 'pm', 'abc', '9:3', '9:60', '25:00', '24:00', '9:30:15', '99', '1234567', '21:30am', '0:30pm']) assert.equal(t(bad), null, JSON.stringify(bad))
})
it('formats and round-trips with the 24-hour value', () => {
  const p = t('9:05pm')
  assert.equal(formatClock(p), '9:05')
  assert.equal(toTime24(p), '21:05')
  assert.equal(toTime24(t('12:15am')), '00:15'); assert.equal(toTime24(t('12:15pm')), '12:15')
})
it('arrow keys step by minutes and wrap round midnight', () => {
  assert.equal(stepTime24('21:30', 15), '21:45')
  assert.equal(stepTime24('21:55', 15), '22:10')
  assert.equal(stepTime24('23:55', 15), '00:10')
  assert.equal(stepTime24('00:05', -15), '23:50')
  assert.equal(stepTime24('', 15), '')
})

console.log('\nonly numbers get in')
const d = formatTypedDigits
it('digits build up a time with the colon put in for you', () => {
  assert.equal(d(''), ''); assert.equal(d('9'), '9'); assert.equal(d('93'), '9:3'); assert.equal(d('930'), '9:30'); assert.equal(d('0930'), '09:30')
  assert.equal(d('12'), '12'); assert.equal(d('123'), '1:23'); assert.equal(d('1230'), '12:30')
})
it('typing a colon changes nothing: the app puts the colon in itself', () => {
  assert.equal(d('9:'), '9'); assert.equal(d('9:3'), '9:3'); assert.equal(d('9:30'), '9:30'); assert.equal(d('12:30'), '12:30')
})
it('24-hour times can be typed all the way through', () => {
  assert.equal(d('13'), '13'); assert.equal(d('19'), '19'); assert.equal(d('193'), '19:3'); assert.equal(d('1930'), '19:30'); assert.equal(d('2359'), '23:59')
})
it('letters and symbols never get in', () => {
  assert.equal(d('aa'), ''); assert.equal(d('9a'), '9'); assert.equal(d('9pm'), '9'); assert.equal(d('-'), ''); assert.equal(d('9.30'), '9:30')
})
it('impossible times are refused: minutes past 59, hours past 23, a fifth digit', () => {
  assert.equal(d('97'), null); assert.equal(d('9:75'), null); assert.equal(d('960'), null)
  assert.equal(d('2530'), null); assert.equal(d('1260'), null); assert.equal(d('2460'), null); assert.equal(d('12345'), null); assert.equal(d('93059'), null)
  assert.equal(d('673'), null)
})
it('anything it allows is something parseTypedTime can finish or is waiting on', () => {
  for (const full of ['9', '9:30', '09:30', '12:00', '1:23', '19:30', '23:59', '0:05']) {
    const shown = d(full); assert.ok(shown !== null, full)
    assert.ok(parseTypedTime(shown), 'parses ' + shown)
  }
  assert.equal(parseTypedTime(d('93')), null) // "9:3": still waiting on a second minute digit
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
