// node tests/dtrExport.test.mjs — the exported DTR sheet: the rows, and the .xlsx
// built from the company template.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as XLSX from 'xlsx'
import { exportRows, cutoffText, longDate } from '../src/services/dtrExport.js'
import { profileFields } from '../src/services/org.js'
import { buildDtrWorkbook } from '../src/services/dtrWorkbook.js'

let pass = 0, fail = 0
function it(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); pass++ }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message.split('\n')[0]}`); fail++ }
}
// 2026-11-23 is a Monday.
const at = (d, h, m = 0) => new Date(2026, 10, d, h, m)
const day = (d) => new Date(2026, 10, d)
const L = (type, d, h, m, extra = {}) => ({ type, timestamp: at(d, h, m), ...extra })
const dates = [day(23), day(24), day(25), day(26), day(27)]

console.log('\nthe rows')
it('one row per day, with the day name and the clocked times', () => {
  const rows = exportRows({ dates, logs: [L('IN', 23, 9, 0), L('OUT', 23, 18, 0)] })
  assert.equal(rows.length, 5)
  assert.equal(rows[0].day, 'Monday'); assert.equal(rows[4].day, 'Friday')
  assert.equal(rows[0].regIn.getHours(), 9); assert.equal(rows[0].regOut.getHours(), 18)
  assert.equal(rows[1].regIn, null)
})
it('an OT session goes in the OT columns with its own reason', () => {
  const rows = exportRows({ dates, logs: [L('OT_IN', 24, 18, 0, { session: 0, otReason: 'Release' }), L('OT_OUT', 24, 21, 0, { session: 0, otReason: 'Release' })] })
  assert.equal(rows[1].otIn.getHours(), 18); assert.equal(rows[1].otOut.getHours(), 21); assert.equal(rows[1].reason, 'Release')
})
it('a day with several OT sessions gets an extra line each, with no day or date on it', () => {
  const rows = exportRows({ dates, logs: [
    L('OT_IN', 24, 18, 0, { session: 0, otReason: 'A' }), L('OT_OUT', 24, 19, 0, { session: 0 }),
    L('OT_IN', 24, 21, 0, { session: 1, otReason: 'B' }), L('OT_OUT', 24, 22, 0, { session: 1 }),
  ] })
  assert.equal(rows.length, 6)
  assert.equal(rows[2].day, ''); assert.equal(rows[2].date, null); assert.equal(rows[2].otIn.getHours(), 21); assert.equal(rows[2].reason, 'B')
  assert.equal(rows[3].day, 'Wednesday')
})
it('a day off with nothing clocked says what it was: a holiday by name, a leave by its type', () => {
  const holidaysByDate = { '2026-11-25': [{ name: 'Test Holiday', type: 'regular' }] }
  const leaves = [{ type: 'sick', status: 'approved', startDate: '2026-11-26', endDate: '2026-11-26', days: 1 }]
  const rows = exportRows({ dates, logs: [], leaves, holidaysByDate })
  assert.equal(rows[2].regIn, 'Test Holiday'); assert.equal(rows[3].regIn, 'Sick Leave')
})
it('times on a holiday win over its name', () => {
  const rows = exportRows({ dates, logs: [L('IN', 25, 9, 0), L('OUT', 25, 12, 0)], holidaysByDate: { '2026-11-25': [{ name: 'X' }] } })
  assert.ok(rows[2].regIn instanceof Date)
})
it('edit and note logs are ignored; ISO strings work', () => {
  const rows = exportRows({ dates, logs: [{ type: 'EDIT', timestamp: at(23, 9, 0) }, { type: 'IN', timestamp: at(23, 9, 30).toISOString() }] })
  assert.equal(rows[0].regIn.getMinutes(), 30)
})
it('the cut off reads in full', () => assert.equal(cutoffText(day(1), day(15)), 'November 1, 2026 – November 15, 2026'))

console.log('\nthe header lines: position and employment date')
it('a start date reads in full; nothing or junk reads as blank', () => {
  assert.equal(longDate('2025-03-17'), 'March 17, 2025')
  assert.equal(longDate(''), ''); assert.equal(longDate(undefined), ''); assert.equal(longDate('soon'), '')
})
it('profile fields are trimmed, capped and validated before they are saved', () => {
  assert.deepEqual(profileFields({ position: '  Designer ', employmentDate: '2025-03-17' }), { position: 'Designer', employmentDate: '2025-03-17' })
  assert.equal(profileFields({ position: 'x'.repeat(200) }).position.length, 80)
  assert.equal(profileFields({ employmentDate: '2025-02-30' }).employmentDate, '') // not a real day
  assert.equal(profileFields({ employmentDate: '17/03/2025' }).employmentDate, '')
  assert.deepEqual(profileFields(), { position: '', employmentDate: '' })
})

console.log('\nthe workbook, built from the real template')
const template = new Uint8Array(fs.readFileSync(new URL('../public/templates/dtr-template.xlsx', import.meta.url)))
const rows = exportRows({
  dates: [day(23), day(24), day(25)],
  logs: [
    L('IN', 23, 9, 0), L('OUT', 23, 18, 0),
    L('IN', 24, 9, 0), L('OUT', 24, 18, 0),
    L('OT_IN', 24, 18, 0, { session: 0, otReason: 'Month-end & close <final>' }), L('OT_OUT', 24, 21, 30, { session: 0 }),
    L('OT_IN', 24, 22, 0, { session: 1, otReason: 'Hotfix' }), L('OT_OUT', 24, 23, 0, { session: 1 }),
  ],
  holidaysByDate: { '2026-11-25': [{ name: 'Test Holiday', type: 'regular' }] },
})
const summary = { lines: [{ label: 'Regular OT', minutes: 270 }, { label: 'Regular OT with ND', minutes: 60 }], totalMinutes: 330 }
const out = buildDtrWorkbook(template, { name: 'Cruz, Juan', positionDept: 'Engineer, Tech', employmentDate: '', cutoffLabel: cutoffText(day(23), day(25)), rows, summary })
const wb = XLSX.read(out, { type: 'array' })
const ws = wb.Sheets[wb.SheetNames[0]]
const v = (ref) => ws[ref]?.v

it('it reads back as a normal workbook with the title block kept', () => {
  assert.equal(v('B2'), 'DAILY TIME RECORD'); assert.equal(v('H2'), 'P U N X')
  assert.equal(v('B3'), 'Name (Last, First,Middle): '); assert.equal(v('B7'), 'DAY'); assert.equal(v('H7'), 'REASON FOR OT')
})
it('fills the four lines at the top', () => {
  assert.equal(v('D3'), 'Cruz, Juan'); assert.equal(v('D4'), 'Engineer, Tech'); assert.equal(v('D6'), 'November 23, 2026 – November 25, 2026')
})
it('puts each day on its row from row 9, dates as real dates and times as real times', () => {
  assert.equal(v('B9'), 'Monday'); assert.equal(v('B10'), 'Tuesday')
  assert.equal(v('C9'), 46349) // 23 Nov 2026
  assert.equal(v('D9'), 9 / 24); assert.equal(v('E9'), 18 / 24)
  assert.equal(v('F10'), 18 / 24); assert.equal(v('G10'), 21.5 / 24)
})
it('a second OT session is on the next line, without a day', () => {
  assert.equal(v('B11'), undefined); assert.equal(v('F11'), 22 / 24); assert.equal(v('H11'), 'Hotfix')
  assert.equal(v('B12'), 'Wednesday'); assert.equal(v('D12'), 'Test Holiday')
})
it('special characters in a reason survive', () => assert.equal(v('H10'), 'Month-end & close <final>'))
it('the summary sits under the table: lines, hours and the total', () => {
  // rows 9..12, blank 13, header 14
  assert.equal(v('B14'), 'OVERTIME SUMMARY')
  assert.equal(v('B15'), 'Regular OT'); assert.equal(v('D15'), 4.5); assert.equal(v('E15'), '4 hrs 30 mins')
  assert.equal(v('B16'), 'Regular OT with ND'); assert.equal(v('D16'), 1)
  assert.equal(v('B17'), 'OT ENTRIES TOTAL (after break)'); assert.equal(v('D17'), 5.5); assert.equal(v('E17'), '5 hrs 30 mins')
})
it('the template\'s look is kept: the same styles on the cells, and the formats added after its own', () => {
  const cfb = XLSX.CFB.read(out, { type: 'array' })
  const sheet = new TextDecoder().decode(XLSX.CFB.find(cfb, '/xl/worksheets/sheet1.xml').content)
  const styles = new TextDecoder().decode(XLSX.CFB.find(cfb, '/xl/styles.xml').content)
  assert.ok(sheet.includes('<c r="B9" s="22"')); assert.ok(sheet.includes('<c r="B10" s="29"')); assert.ok(sheet.includes('<c r="B12" s="41"'))
  assert.ok(styles.includes('<cellXfs count="59">'))
  assert.equal((styles.match(/<xf /g) || []).length, 59 + 1) // 59 cell formats + the one cellStyleXfs entry
  assert.ok(sheet.includes('<c r="F12" s="48"')) // the last row's OT cells get a time format, not the general one
})
it('the merged cells grow by exactly the new ones and keep the template\'s', () => {
  const cfb = XLSX.CFB.read(out, { type: 'array' })
  const sheet = new TextDecoder().decode(XLSX.CFB.find(cfb, '/xl/worksheets/sheet1.xml').content)
  const refs = [...sheet.matchAll(/<mergeCell ref="([^"]+)"/g)].map(m => m[1])
  const declared = Number(/<mergeCells count="(\d+)"/.exec(sheet)[1])
  assert.equal(refs.length, declared)
  assert.ok(refs.includes('B2:G2')); assert.ok(refs.includes('D3:H3')); assert.ok(refs.includes('B14:H14'))
  assert.equal(new Set(refs).size, refs.length)
})
it('the sheet XML is well formed', () => {
  const cfb = XLSX.CFB.read(out, { type: 'array' })
  for (const p of ['/xl/worksheets/sheet1.xml', '/xl/styles.xml']) {
    const xml = new TextDecoder().decode(XLSX.CFB.find(cfb, p).content)
    const stack = []
    for (const m of xml.matchAll(/<(\/?)([A-Za-z0-9:_-]+)([^>]*?)(\/?)>/g)) {
      if (m[0].startsWith('<?')) continue
      if (m[4] === '/') continue
      if (m[1] === '/') { assert.equal(stack.pop(), m[2], `unbalanced </${m[2]}> in ${p}`) } else stack.push(m[2])
    }
    assert.equal(stack.length, 0, `unclosed tags in ${p}: ${stack.join(',')}`)
  }
})
it('with nothing to summarise it says so, and still totals', () => {
  const o2 = buildDtrWorkbook(template, { name: 'A', positionDept: '', employmentDate: '', cutoffLabel: '', rows: exportRows({ dates: [day(23)], logs: [] }), summary: { lines: [], totalMinutes: 0 } })
  const w2 = XLSX.read(o2, { type: 'array' }).Sheets.Sheet1
  assert.equal(w2.B11.v, 'OVERTIME SUMMARY'); assert.equal(w2.B12.v, 'No overtime, rest-day or holiday work in this period'); assert.equal(w2.B13.v, 'OT ENTRIES TOTAL (after break)'); assert.equal(w2.D13.v, 0)
})
it('a template that is not the DTR template is refused, not silently wrecked', () => {
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['x']]), 'S')
  const bad = XLSX.write(book, { type: 'array', bookType: 'xlsx' })
  assert.throws(() => buildDtrWorkbook(new Uint8Array(bad), { rows: [] }), /template|sheet|styles|rows/i)
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
