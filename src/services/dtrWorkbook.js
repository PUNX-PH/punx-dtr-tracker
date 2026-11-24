// Fills the company's DTR template (public/templates/dtr-template.xlsx) with one
// person's period. Pure — bytes in, bytes out — so it runs in the browser and in
// the tests (tests/dtrExport.test.mjs).
//
// WHY THIS WORKS ON THE FILE ITSELF: the spreadsheet library the app uses writes
// values but not styling, so a sheet built from scratch loses the template's
// fonts, fills and borders. An .xlsx is a zip of XML files, so instead the
// template is opened, its sheet is rewritten with the template's OWN style ids,
// and it is zipped back up. The look is the template's, not an imitation.
//
// Layout it relies on (the template's): rows 1–8 are the title block and column
// headers, day rows start at row 9, columns A–H. Name / position / employment
// date / cut off go in D3:D6.

import * as XLSX from 'xlsx'
import { formatDuration } from './overtime.js'

// Style ids in the template's styles.xml (cellXfs). Day rows come in three
// flavours — first, middle, last — because the template's borders differ.
const STYLE = {
    margin: 21,
    first: { day: 22, date: 23, regIn: 24, regOut: 25, otIn: 26, otOut: 27, reason: 28 },
    middle: { day: 29, date: 30, regIn: 31, regOut: 32, otIn: 33, otOut: 34, reason: 35 },
    // The template's last row leaves its OT cells in the general format, which would
    // show a time as 0.75. 48 and 49 below are the same cells with a time format.
    last: { day: 41, date: 42, regIn: 43, regOut: 44, otIn: 48, otOut: 49, reason: 47 },
    header: 11,
}

// Extra cell formats appended to the template's, for the summary under the table.
const NEW_XFS = [
    // 48, 49: the template's last-row OT cells, with a time format
    '<xf borderId="10" fillId="10" fontId="12" numFmtId="18" xfId="0" applyAlignment="1" applyBorder="1" applyFill="1" applyFont="1" applyNumberFormat="1"><alignment vertical="bottom"/></xf>',
    '<xf borderId="11" fillId="10" fontId="12" numFmtId="18" xfId="0" applyAlignment="1" applyBorder="1" applyFill="1" applyFont="1" applyNumberFormat="1"><alignment vertical="bottom"/></xf>',
    // 50 label, 51 hours, 52 text (middle), 53 text (last) — Arial 12 like the day cells
    '<xf borderId="12" fillId="0" fontId="10" numFmtId="0" xfId="0" applyAlignment="1" applyBorder="1" applyFont="1"><alignment vertical="bottom"/></xf>',
    '<xf borderId="12" fillId="0" fontId="10" numFmtId="2" xfId="0" applyAlignment="1" applyBorder="1" applyFont="1" applyNumberFormat="1"><alignment horizontal="right" vertical="bottom"/></xf>',
    '<xf borderId="13" fillId="0" fontId="10" numFmtId="0" xfId="0" applyAlignment="1" applyBorder="1" applyFont="1"><alignment vertical="bottom"/></xf>',
    '<xf borderId="15" fillId="0" fontId="10" numFmtId="0" xfId="0" applyAlignment="1" applyBorder="1" applyFont="1"><alignment vertical="bottom"/></xf>',
    // 54–57: the same four, bold (the total line)
    '<xf borderId="12" fillId="0" fontId="7" numFmtId="0" xfId="0" applyAlignment="1" applyBorder="1" applyFont="1"><alignment vertical="bottom"/></xf>',
    '<xf borderId="12" fillId="0" fontId="7" numFmtId="2" xfId="0" applyAlignment="1" applyBorder="1" applyFont="1" applyNumberFormat="1"><alignment horizontal="right" vertical="bottom"/></xf>',
    '<xf borderId="13" fillId="0" fontId="7" numFmtId="0" xfId="0" applyAlignment="1" applyBorder="1" applyFont="1"><alignment vertical="bottom"/></xf>',
    '<xf borderId="15" fillId="0" fontId="7" numFmtId="0" xfId="0" applyAlignment="1" applyBorder="1" applyFont="1"><alignment vertical="bottom"/></xf>',
    // 58: a wrapped note
    '<xf borderId="0" fillId="0" fontId="8" numFmtId="0" xfId="0" applyAlignment="1" applyFont="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>',
]
const S = { label: 50, hours: 51, textMid: 52, textEnd: 53, labelB: 54, hoursB: 55, textMidB: 56, textEndB: 57, note: 58 }

const REASON_COL_WIDTH = 46 // the template's 22.5 cuts a typical reason short

const esc = (s) => String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const str = (ref, s, text) => (text === '' || text == null
    ? `<c r="${ref}" s="${s}"/>`
    : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`)
const num = (ref, s, n) => `<c r="${ref}" s="${s}"><v>${n}</v></c>`

/** Excel's date number for a calendar day (whole days since 1899-12-30). */
const dateSerial = (d) => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000)
/** Excel's number for a time of day: the fraction of a day. */
const timeSerial = (d) => (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400

/** A time (Date), text (string) or nothing (null), in the right kind of cell. */
const timeOrText = (ref, s, v) => (v instanceof Date ? num(ref, s, timeSerial(v)) : str(ref, s, v))

const decode = (bytes) => new TextDecoder('utf-8').decode(bytes)
const encode = (text) => new TextEncoder().encode(text)

/**
 * @param templateBytes  the template .xlsx (Uint8Array / ArrayBuffer)
 * @param data {
 *   name, positionDept, employmentDate, cutoffLabel    the four lines at the top
 *   rows      from dtrExport.exportRows()
 *   summary   { lines: [{ label, minutes }], totalMinutes } — the OT breakdown under the table
 * }
 * @returns Uint8Array — the finished .xlsx
 */
export function buildDtrWorkbook(templateBytes, data) {
    const bytes = templateBytes instanceof Uint8Array ? templateBytes : new Uint8Array(templateBytes)
    const cfb = XLSX.CFB.read(bytes, { type: 'array' })
    const sheetEntry = XLSX.CFB.find(cfb, '/xl/worksheets/sheet1.xml')
    const stylesEntry = XLSX.CFB.find(cfb, '/xl/styles.xml')
    if (!sheetEntry || !stylesEntry) throw new Error('That is not the DTR template: its sheet or styles are missing.')

    let sheet = decode(sheetEntry.content)
    let styles = decode(stylesEntry.content)

    // ---- styles: add the extra formats after the template's own ----
    const xfCount = /<cellXfs count="(\d+)">/.exec(styles)
    if (!xfCount || Number(xfCount[1]) !== 48) throw new Error('The DTR template changed: its cell formats are not what the export expects.')
    styles = styles
        .replace(`<cellXfs count="48">`, `<cellXfs count="${48 + NEW_XFS.length}">`)
        .replace('</cellXfs>', `${NEW_XFS.join('')}</cellXfs>`)

    // ---- pieces of the sheet to keep ----
    const sdStart = sheet.indexOf('<sheetData>')
    const sdEnd = sheet.indexOf('</sheetData>')
    const row9 = sheet.indexOf('<row r="9"')
    if (sdStart < 0 || sdEnd < 0 || row9 < 0) throw new Error('The DTR template changed: its rows are not where the export expects.')
    const before = sheet.slice(0, sdStart).replace('<col customWidth="1" min="8" max="8" width="22.5"/>', `<col customWidth="1" min="8" max="8" width="${REASON_COL_WIDTH}"/>`)
    let head = sheet.slice(sdStart + '<sheetData>'.length, row9) // title block + column headers, as the template has them
    let after = sheet.slice(sdEnd + '</sheetData>'.length)

    // the four lines at the top (merged D:H in the template, so only D is filled)
    const top = [['D3', data.name], ['D4', data.positionDept], ['D5', data.employmentDate], ['D6', data.cutoffLabel]]
    for (const [ref, text] of top) {
        const empty = `<c r="${ref}" s="9"/>`
        if (!head.includes(empty)) throw new Error(`The DTR template changed: ${ref} is not where the export expects.`)
        head = head.replace(empty, str(ref, 9, text || ''))
    }

    // ---- day rows ----
    const rows = data.rows || []
    const parts = []
    rows.forEach((row, i) => {
        const r = 9 + i
        const st = i === rows.length - 1 ? STYLE.last : i === 0 ? STYLE.first : STYLE.middle
        parts.push(
            `<row r="${r}" ht="15.75" customHeight="1">`
            + `<c r="A${r}" s="${STYLE.margin}"/>`
            + str(`B${r}`, st.day, row.day)
            + (row.date ? num(`C${r}`, st.date, dateSerial(row.date)) : `<c r="C${r}" s="${st.date}"/>`)
            + timeOrText(`D${r}`, st.regIn, row.regIn)
            + timeOrText(`E${r}`, st.regOut, row.regOut)
            + timeOrText(`F${r}`, st.otIn, row.otIn)
            + timeOrText(`G${r}`, st.otOut, row.otOut)
            + str(`H${r}`, st.reason, row.reason)
            + '</row>'
        )
    })

    // ---- the OT breakdown under the table ----
    const merges = []
    let r = 9 + rows.length + 1
    const summary = data.summary
    if (summary) {
        const hrs = (min) => Math.round((min / 60) * 100) / 100
        // header
        parts.push(`<row r="${r}" ht="15.75" customHeight="1"><c r="A${r}" s="${STYLE.margin}"/>${str(`B${r}`, STYLE.header, 'OVERTIME SUMMARY')}${['C', 'D', 'E', 'F', 'G', 'H'].map(c => `<c r="${c}${r}" s="${STYLE.header}"/>`).join('')}</row>`)
        merges.push(`B${r}:H${r}`)
        r++
        const line = (label, minutes, bold) => {
            const st = bold ? { l: S.labelB, h: S.hoursB, m: S.textMidB, e: S.textEndB } : { l: S.label, h: S.hours, m: S.textMid, e: S.textEnd }
            parts.push(
                `<row r="${r}" ht="15.75" customHeight="1"><c r="A${r}" s="${STYLE.margin}"/>`
                + str(`B${r}`, st.l, label) + `<c r="C${r}" s="${st.l}"/>`
                + num(`D${r}`, st.h, hrs(minutes))
                + str(`E${r}`, st.m, `${formatDuration(minutes)}`)
                + `<c r="F${r}" s="${st.m}"/><c r="G${r}" s="${st.m}"/><c r="H${r}" s="${st.e}"/></row>`
            )
            merges.push(`B${r}:C${r}`, `E${r}:G${r}`)
            r++
        }
        const lines = (summary.lines || []).filter(l => l.minutes > 0)
        if (lines.length === 0) {
            parts.push(`<row r="${r}" ht="15.75" customHeight="1"><c r="A${r}" s="${STYLE.margin}"/>${str(`B${r}`, S.label, 'No overtime, rest-day or holiday work in this period')}<c r="C${r}" s="${S.label}"/>${['D', 'E', 'F', 'G'].map(c => `<c r="${c}${r}" s="${S.textMid}"/>`).join('')}<c r="H${r}" s="${S.textEnd}"/></row>`)
            merges.push(`B${r}:C${r}`)
            r++
        }
        lines.forEach(l => line(l.label, l.minutes, false))
        line('OT ENTRIES TOTAL (after break)', summary.totalMinutes || 0, true)
        parts.push(`<row r="${r}" ht="42" customHeight="1"><c r="A${r}" s="${STYLE.margin}"/>${str(`B${r}`, S.note, 'ND (10:00 PM – 6:00 AM) hours are part of the overtime, not added on top. One continuous stretch longer than 5 hours has 1 hour taken off for the break. Rest-day and holiday work counts the first 8 actual hours as work, the rest as OT.')}</row>`)
        merges.push(`B${r}:H${r}`)
    }

    // ---- merges ----
    if (merges.length) {
        const m = /<mergeCells count="(\d+)">/.exec(after)
        if (!m) throw new Error('The DTR template changed: its merged cells are not where the export expects.')
        after = after
            .replace(m[0], `<mergeCells count="${Number(m[1]) + merges.length}">`)
            .replace('</mergeCells>', `${merges.map(x => `<mergeCell ref="${x}"/>`).join('')}</mergeCells>`)
    }

    sheet = `${before}<sheetData>${head}${parts.join('')}</sheetData>${after}`

    const sheetBytes = encode(sheet)
    sheetEntry.content = sheetBytes
    sheetEntry.size = sheetBytes.length
    const styleBytes = encode(styles)
    stylesEntry.content = styleBytes
    stylesEntry.size = styleBytes.length

    return new Uint8Array(XLSX.CFB.write(cfb, { type: 'array', fileType: 'zip' }))
}
