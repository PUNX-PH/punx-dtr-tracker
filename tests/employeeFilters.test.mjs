// node tests/employeeFilters.test.mjs — the Employees list filters: DTR status,
// assigned senior and search, and how they combine.
import assert from 'node:assert/strict'
import { dtrState, narrowEmployees, countByState, applyStatus, seniorOptions } from '../src/services/employeeFilters.js'

let pass = 0, fail = 0
function it(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); pass++ }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message.split('\n')[0]}`); fail++ }
}

const users = [
  { id: 's1', name: 'Aina', email: 'aina@punx.ai', isSenior: true },
  { id: 's2', name: 'Ailin', email: 'ailin@punx.ai', isSenior: true },
  { id: 'u1', name: 'Zed', email: 'zed@punx.ai', assignedSeniorId: 's1' },
  { id: 'u2', name: 'Bea', email: 'bea@punx.ai', assignedSeniorId: 's1' },
  { id: 'u3', name: 'Cy', email: 'cy@punx.ai', assignedSeniorId: 's2' },
  { id: 'u4', name: 'Dee', email: 'dee@punx.ai' },
  { id: 'u5', name: 'Eli', email: 'eli@punx.ai', assignedSeniorId: 's1', removed: true },
]
const subs = {
  u1: { status: 'pending' },
  u2: { status: 'approved' },
  u3: { status: 'rejected' },
  // u4: nothing sent
}

console.log('\nwhere a DTR stands')
it('no submission is not sent; pending is waiting; approved; rejected', () => {
  assert.equal(dtrState(undefined), 'notsent')
  assert.equal(dtrState({ status: 'pending' }), 'waiting')
  assert.equal(dtrState({ status: 'approved' }), 'approved')
  assert.equal(dtrState({ status: 'rejected' }), 'rejected')
})
it('any other status still counts as waiting — it was sent and nobody has decided', () =>
  assert.equal(dtrState({ status: 'submitted' }), 'waiting'))

console.log('\nthe status filter')
const all = users.filter(u => !u.removed)
it('waiting is sent and not yet approved', () =>
  assert.deepEqual(applyStatus(all, 'waiting', subs).map(u => u.id), ['u1']))
it('approved is the green ones', () =>
  assert.deepEqual(applyStatus(all, 'approved', subs).map(u => u.id), ['u2']))
it('not sent includes people with no submission, such as the seniors', () =>
  assert.deepEqual(applyStatus(all, 'notsent', subs).map(u => u.id), ['s2', 's1', 'u4'])) // by name: Ailin, Aina, Dee
it('all keeps everyone, sorted by name', () =>
  assert.deepEqual(applyStatus(all, 'all', subs).map(u => u.name), ['Ailin', 'Aina', 'Bea', 'Cy', 'Dee', 'Zed']))
it('counts add up to everyone', () => {
  const c = countByState(all, subs)
  assert.deepEqual(c, { all: 6, notsent: 3, waiting: 1, approved: 1, rejected: 1 })
})

console.log('\nthe senior filter')
it('a senior shows only the people assigned to them', () =>
  assert.deepEqual(narrowEmployees(all, { senior: 's1' }).map(u => u.id), ['u1', 'u2']))
it('"none" is people with nobody assigned', () =>
  assert.deepEqual(narrowEmployees(all, { senior: 'none' }).map(u => u.id), ['s1', 's2', 'u4']))
it('"all" keeps everyone', () => assert.equal(narrowEmployees(all, { senior: 'all' }).length, 6))

console.log('\nthey combine')
it("one senior's people who have not been approved yet", () => {
  const list = narrowEmployees(all, { senior: 's1' })
  assert.deepEqual(applyStatus(list, 'waiting', subs).map(u => u.id), ['u1'])
  assert.deepEqual(applyStatus(list, 'approved', subs).map(u => u.id), ['u2'])
})
it('the chip counts follow the senior and search filters', () => {
  assert.deepEqual(countByState(narrowEmployees(all, { senior: 's1' }), subs), { all: 2, notsent: 0, waiting: 1, approved: 1, rejected: 0 })
})
it('search matches name or email, ignoring case and spaces around it', () => {
  assert.deepEqual(narrowEmployees(all, { search: '  ZED ' }).map(u => u.id), ['u1'])
  assert.deepEqual(narrowEmployees(all, { search: 'bea@' }).map(u => u.id), ['u2'])
})
it('search and senior together', () =>
  assert.deepEqual(narrowEmployees(all, { search: 'z', senior: 's2' }), []))

console.log('\nthe senior dropdown')
it('lists seniors with how many people are assigned, by name, and not the removed', () => {
  assert.deepEqual(seniorOptions(users), [
    { id: 's2', name: 'Ailin', count: 1 },
    { id: 's1', name: 'Aina', count: 2 }, // not 3: Eli was removed
  ])
})
it('someone who is assigned people but lost the senior flag is still listed', () => {
  const u = [{ id: 'a', name: 'Al' }, { id: 'b', name: 'Bo', assignedSeniorId: 'a' }]
  assert.deepEqual(seniorOptions(u), [{ id: 'a', name: 'Al', count: 1 }])
})
it('no seniors, no options', () => assert.deepEqual(seniorOptions([{ id: 'a', name: 'Al' }]), []))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
