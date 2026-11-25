// DTR attachments. Pure helpers plus the browser-only image shrinking, so the
// rules about sizes and chunks can be tested in plain node (tests/attachments.test.mjs).
//
// WHY THIS EXISTS: Firestore refuses any single record over 1 MiB. Attachments
// used to be stored as base64 text INSIDE the submission record, so two phone
// photos filled it and a third failed with "The value of property "array" is
// longer than 1048487 bytes". Now each attachment is stored in its own records
// (api.js attachmentApi), cut into chunks that each fit in one, so the total is no
// longer squeezed into one record. Photos are also shrunk automatically: a phone
// photo of 5–10 MB reads just as well at 1.5 MB, and it uploads far faster.

/** Characters of base64 text per stored chunk. A record is 1,048,576 bytes at most; this leaves plenty of headroom. */
export const CHUNK_CHARS = 700000

export const MAX_FILE_BYTES = 8 * 1024 * 1024 // any one file that is not an image
export const MAX_IMAGE_BYTES = 40 * 1024 * 1024 // an image as picked from the camera — it is shrunk before it is sent
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024 // everything added in one submission
export const IMAGE_TARGET_BYTES = Math.floor(1.5 * 1024 * 1024) // photos bigger than this are shrunk to about it

/** A fresh id for one attachment (its chunk records are named after it). */
export const newFileId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`)

export const isImage = (file) => /^image\//.test(file?.type || '')

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** A long string cut into pieces of at most `size` characters. '' -> []. */
export function splitChunks(text, size = CHUNK_CHARS) {
    const out = []
    for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
    return out
}

export const joinChunks = (chunks) => chunks.join('')

/** The real size, in bytes, of what a data URL carries. */
export function dataUrlBytes(url) {
    const comma = url.indexOf(',')
    const b64 = comma >= 0 ? url.slice(comma + 1) : url
    const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
    return Math.max(0, Math.floor((b64.length * 3) / 4) - pad)
}

/** 'data:image/jpeg;base64,…' -> 'image/jpeg' */
export const mimeOf = (url) => /^data:([^;,]+)/.exec(url || '')?.[1] || 'application/octet-stream'

/**
 * Says what is wrong with the files someone just picked, or null if they are fine.
 * Images may be big (they get shrunk); anything else has a firm cap, since it can't be.
 * `alreadyBytes` is what this submission has queued already.
 */
export function checkFiles(files, alreadyBytes = 0) {
    let total = alreadyBytes
    for (const f of files) {
        if (isImage(f)) {
            if (f.size > MAX_IMAGE_BYTES) return `"${f.name}" is ${mb(f.size)} — too large even for a photo. Please pick a smaller one.`
            total += Math.min(f.size, IMAGE_TARGET_BYTES) // what it will be after shrinking, at most
        } else {
            if (f.size > MAX_FILE_BYTES) return `"${f.name}" is ${mb(f.size)} — the most for a file that is not an image is ${mb(MAX_FILE_BYTES)}. Share it as a link instead.`
            total += f.size
        }
    }
    if (total > MAX_TOTAL_BYTES) return `That is ${mb(total)} of attachments in total; the most for one submission is ${mb(MAX_TOTAL_BYTES)}. Remove a few, or share them as a link.`
    return null
}

// ---- browser only from here: they use FileReader / canvas ----

export function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error(`Couldn't read "${file.name}".`))
        reader.readAsDataURL(file)
    })
}

const SHRINK_STEPS = [[2000, 0.85], [1600, 0.8], [1280, 0.7], [1024, 0.6]] // [longest side in px, JPEG quality]

async function decodeImage(file) {
    if (typeof createImageBitmap === 'function') {
        try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { /* fall through to <img> */ }
    }
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const img = new Image()
        img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')) }
        img.src = url
    })
}

/**
 * A photo as a JPEG data URL of about IMAGE_TARGET_BYTES, trying smaller sizes
 * until it fits. A photo already small enough is sent as it is, untouched.
 */
export async function shrinkImage(file) {
    if (file.size <= IMAGE_TARGET_BYTES) return readAsDataURL(file)
    const img = await decodeImage(file)
    const w = img.width || img.naturalWidth
    const h = img.height || img.naturalHeight
    let last = null
    for (const [side, quality] of SHRINK_STEPS) {
        const scale = Math.min(1, side / Math.max(w, h))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(w * scale))
        canvas.height = Math.max(1, Math.round(h * scale))
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff' // a transparent PNG would otherwise turn black as a JPEG
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        last = canvas.toDataURL('image/jpeg', quality)
        if (dataUrlBytes(last) <= IMAGE_TARGET_BYTES) break
    }
    if (typeof img.close === 'function') img.close()
    return last
}

/**
 * One picked file, ready to send: { name, mime, dataUrl }. Photos are shrunk;
 * everything else goes as it is. A photo the browser can't decode (a HEIC on a
 * browser without HEIC support) is sent as it is if it is small enough to keep.
 */
export async function prepareFile(file) {
    if (!isImage(file)) return { name: file.name, mime: file.type || 'application/octet-stream', dataUrl: await readAsDataURL(file) }
    try {
        const dataUrl = await shrinkImage(file)
        return { name: file.name, mime: mimeOf(dataUrl), dataUrl }
    } catch {
        if (file.size > MAX_FILE_BYTES) throw new Error(`Couldn't shrink "${file.name}", and it is too large to send as it is. Try a screenshot or a JPEG instead.`)
        return { name: file.name, mime: file.type || 'application/octet-stream', dataUrl: await readAsDataURL(file) }
    }
}
