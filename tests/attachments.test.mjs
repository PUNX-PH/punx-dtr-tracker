// node tests/attachments.test.mjs — the size rules and chunking behind DTR attachments.
import assert from 'node:assert/strict'
import {
  CHUNK_CHARS, MAX_FILE_BYTES, MAX_IMAGE_BYTES, MAX_TOTAL_BYTES, IMAGE_TARGET_BYTES,
  splitChunks, joinChunks, dataUrlBytes, mimeOf, checkFiles, isImage,
} from '../src/services/attachments.js'

let pass = 0, fail = 0
function it(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); pass++ }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message.split('\n')[0]}`); fail++ }
}
const MB = 1024 * 1024
const file = (name, size, type) => ({ name, size, type })

console.log('\nchunking')
it('a long string is cut into pieces that each fit, and joins back exactly', () => {
  const text = 'x'.repeat(CHUNK_CHARS * 2 + 123)
  const parts = splitChunks(text)
  assert.equal(parts.length, 3)
  assert.ok(parts.every(p => p.length <= CHUNK_CHARS))
  assert.equal(joinChunks(parts), text)
})
it('short text is one piece, nothing is none', () => {
  assert.deepEqual(splitChunks('abc'), ['abc']); assert.deepEqual(splitChunks(''), [])
})
it('a chunk is comfortably under the 1 MiB record limit', () => assert.ok(CHUNK_CHARS < 1048576 * 0.75))

console.log('\nsizes')
it('a data URL is measured by what it carries, not its text length', () => {
  const b64 = Buffer.from('hello world!!').toString('base64') // 13 bytes
  assert.equal(dataUrlBytes(`data:text/plain;base64,${b64}`), 13)
  assert.equal(mimeOf(`data:image/png;base64,${b64}`), 'image/png'); assert.equal(mimeOf('nonsense'), 'application/octet-stream')
})
it('images are told apart from other files', () => {
  assert.equal(isImage(file('a.jpg', 1, 'image/jpeg')), true); assert.equal(isImage(file('a.pdf', 1, 'application/pdf')), false)
})

console.log('\nwhat can be picked')
it('a big phone photo is fine — it is shrunk later', () => assert.equal(checkFiles([file('IMG.jpg', 12 * MB, 'image/jpeg')]), null))
it('a photo past the sanity limit is refused', () => assert.match(checkFiles([file('IMG.jpg', MAX_IMAGE_BYTES + 1, 'image/jpeg')]), /too large even for a photo/))
it('another kind of file has a firm cap and says what to do', () => {
  assert.equal(checkFiles([file('r.pdf', MAX_FILE_BYTES, 'application/pdf')]), null)
  assert.match(checkFiles([file('r.pdf', MAX_FILE_BYTES + 1, 'application/pdf')]), /Share it as a link/)
})
it('the total for one submission is capped, counting what is already queued', () => {
  const photos = Array.from({ length: 20 }, (_, i) => file(`p${i}.jpg`, 9 * MB, 'image/jpeg')) // 20 × ≤1.5 MB after shrinking = 30 MB
  assert.match(checkFiles(photos), /in total/)
  assert.equal(checkFiles(photos.slice(0, 10)), null) // 15 MB
  assert.match(checkFiles([file('a.pdf', 5 * MB, 'application/pdf')], MAX_TOTAL_BYTES - 4 * MB), /in total/)
})
it('a phone full of ordinary photos goes through, which the old way could not', () => {
  const three = [1, 2, 3].map(i => file(`IMG_${i}.jpg`, 4.5 * MB, 'image/jpeg')) // the reported failure: ~13 MB of photos
  assert.equal(checkFiles(three), null)
  assert.ok(IMAGE_TARGET_BYTES < 2 * MB)
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
