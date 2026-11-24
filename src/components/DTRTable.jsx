import { useState, useEffect, useMemo, useRef } from 'react'
import { Pencil, Save, X, Loader2, Zap, Trash2, Plus, AlertTriangle } from 'lucide-react'
import { api } from '../services/api'
import { leaveForDate, dtrLabel, leaveNote, isPartialDay, toYMD, LEAVE_TYPES } from '../services/leave'
import { formatDuration, otHoursFromLogs } from '../services/overtime'
import { checkOTSession } from '../services/workday'
import { HOLIDAY_TYPES } from '../services/holidays'
import { useHolidays } from './useHolidays'
import { parseTime, toTime24, formatHHMM, parseTypedTime, formatClock, stepTime24, formatTypedDigits } from '../services/time'

// `leaves` is the person's leave/offset requests (any status — only approved
// ones are drawn). They are overlaid at read time rather than written into
// `logs`, so a revoked leave simply stops showing and payroll's own records are
// never touched by the leave feature.
//
// Reviewer aids, both optional and passed only by the admin dashboard:
//   flaggedDays  ['YYYY-MM-DD', ...] days with an OT entry that is missing its start
//                or end — drawn with an amber edge and a "not counted" note
//   otTotals     { 'YYYY-MM-DD': minutes } each day's counted overtime, shown under
//                that day's sessions
// Holidays are drawn from the shared holiday list: a coloured outline round the
// row (teal regular, amber special, pink company) and the holiday's name under
// the day. They are not written into the DTR — like leave, they are overlaid.
// Overtime is only ever time outside 9:00 AM – 6:00 PM on a working day: saving
// OT inside regular hours is refused, every OT session needs its own reason, and
// anything already inside regular hours is flagged and left out of the count.
// Every row also carries data-dtr-day so a reviewer can be scrolled to it.
export default function DTRTable({ user, history, onRefresh, initialDate, periodEnd, canEdit = true, leaves = [], flaggedDays = null, otTotals = null }) {
    const draftStorageKey = `dtr_draft_${user.id}`

    // Reads a non-empty draft for `key`, or null. Read-only views (canEdit=false)
    // never restore since there's no save flow there to resume.
    const readDraft = (key) => {
        if (!canEdit) return null
        try {
            const saved = localStorage.getItem(key)
            if (!saved) return null
            const parsed = JSON.parse(saved)
            if (parsed && Object.keys(parsed).length > 0) return parsed
        } catch (e) {
            console.warn('Failed to restore DTR draft', e)
        }
        return null
    }

    // Read synchronously as part of initial state — not in a useEffect — so a
    // refresh lands directly in edit mode with the draft already showing on the
    // very first paint, instead of racing a later effect to restore it.
    const initialDraft = readDraft(draftStorageKey)

    const [editMode, setEditMode] = useState(!!initialDraft)
    const [edits, setEdits] = useState(initialDraft || {}) // Key: "YYYY-MM-DD_TYPE", Value: "HH:MM" or "REASON_TEXT"
    const [saving, setSaving] = useState(false)
    const [anchorDate, setAnchorDate] = useState(new Date())
    const [restoredDraft, setRestoredDraft] = useState(!!initialDraft)
    // Time boxes that are half-entered right now: { cellKey: 'what it needs' }. A
    // half-entered time never reaches the save, so Save refuses until they're fixed
    // rather than quietly skipping them.
    const [timeHints, setTimeHints] = useState({})
    const setHint = (key, hint) => setTimeHints(prev => {
        if ((prev[key] || null) === (hint || null)) return prev
        const next = { ...prev }
        if (hint) next[key] = hint; else delete next[key]
        return next
    })

    const hasMountedRestoreRef = useRef(false)
    const hasMountedPersistRef = useRef(false)

    // Sync anchorDate with initialDate if provided
    useEffect(() => {
        if (initialDate) {
            setAnchorDate(new Date(initialDate))
        } else {
            setAnchorDate(new Date())
        }
    }, [initialDate])

    // The initial state above already covers the normal mount case. This only
    // handles switching to a different user's table without a remount (e.g.
    // Admin picking another employee), where draftStorageKey changes later.
    useEffect(() => {
        if (!hasMountedRestoreRef.current) {
            hasMountedRestoreRef.current = true
            return
        }
        const draft = readDraft(draftStorageKey)
        if (draft) {
            setEdits(draft)
            setEditMode(true)
            setRestoredDraft(true)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draftStorageKey, canEdit])

    // Keep the draft in sync with every edit. Cleared automatically once
    // `edits` empties out (Save, Cancel, or a fresh Clear-all all reset it).
    // Skips its very first run: `edits` already matches localStorage from the
    // initial state above, so writing again there is redundant.
    useEffect(() => {
        if (!hasMountedPersistRef.current) {
            hasMountedPersistRef.current = true
            return
        }
        try {
            if (Object.keys(edits).length > 0) {
                localStorage.setItem(draftStorageKey, JSON.stringify(edits))
            } else {
                localStorage.removeItem(draftStorageKey)
                setRestoredDraft(false)
            }
        } catch (e) {
            console.warn('Failed to persist DTR draft', e)
        }
    }, [edits, draftStorageKey])

    // Generate rows based on anchorDate
    const rows = useMemo(() => {
        const dates = []
        const start = new Date(anchorDate)

        let numDays = 16 // Default

        if (periodEnd) {
            const end = new Date(periodEnd)
            // Calculate difference in days (inclusive)
            const diffTime = Math.abs(end - start)
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

            // If start is before or equal to end, use difference + 1
            if (start <= end) {
                numDays = diffDays + 1
            }
        }

        for (let i = 0; i < numDays; i++) {
            const d = new Date(start)
            d.setDate(start.getDate() + i)
            dates.push(d)
        }
        return dates
    }, [anchorDate, periodEnd])

    // Holidays for the years on screen, and the working-day test built from them.
    const holidayYears = [...new Set(rows.map(d => d.getFullYear()))]
    const { byDate: holidayIndex, isWorkday, dayKind } = useHolidays(holidayYears)
    const holidayOn = (date) => holidayIndex[toYMD(date)]?.[0] || null
    const holidayTypesInView = [...new Set(rows.map(holidayOn).filter(Boolean).map(h => h.type))]

    // What the OT rules make of the logs on screen, per session.
    const otInfo = useMemo(() => otHoursFromLogs(history, { dayKind }), [history, dayKind])
    const overlapBySession = useMemo(() => new Map(otInfo.overlaps.map(o => [`${o.day}_${o.session}`, o])), [otInfo])

    // session is only meaningful for OT_IN/OT_OUT (multiple OT sessions per day).
    // Omit it for IN/OUT/REASON to keep their keys unchanged.
    const getCellKey = (date, type, session) =>
        session !== undefined ? `${date.toDateString()}_${type}_${session}` : `${date.toDateString()}_${type}`

    // Helper to find existing log in history. When session is omitted, matches
    // any log of that type/date (used for IN/OUT, which never carry a session).
    const findLog = (date, type, session) => {
        return history.find(h =>
            new Date(h.timestamp).toDateString() === date.toDateString() &&
            h.type === type &&
            (session === undefined || (h.session || 0) === session)
        )
    }

    // Same as findLog but returns every match — used when saving to catch
    // duplicate logs on the same (date, type, session) so they stay in sync.
    const findAllLogs = (date, type, session) => history.filter(h =>
        new Date(h.timestamp).toDateString() === date.toDateString() &&
        h.type === type &&
        (session === undefined || (h.session || 0) === session)
    )

    // Every OT session index that exists for this date, from saved history AND
    // pending edits, always including session 0 so there's a blank slot to type
    // into even when the day has no overtime yet.
    const getOTSessionsForDate = (date) => {
        const dateStr = date.toDateString()
        const sessions = new Set([0])
        history.forEach(h => {
            if ((h.type === 'OT_IN' || h.type === 'OT_OUT') && new Date(h.timestamp).toDateString() === dateStr) {
                sessions.add(h.session || 0)
            }
        })
        Object.keys(edits).forEach(key => {
            const m = key.match(/^(.+)_OT_(?:IN|OUT|REASON)_(\d+)$/)
            if (m && m[1] === dateStr) sessions.add(parseInt(m[2]))
        })
        return [...sessions].sort((a, b) => a - b)
    }

    // Sessions that actually have a value to show (view mode skips empty slots)
    const getVisibleOTSessions = (date) => getOTSessionsForDate(date).filter(session =>
        getDisplayValue(date, 'OT_IN', session) || getDisplayValue(date, 'OT_OUT', session)
    )

    // Helper to find ANY log for a specific date (to get/set reason), ignoring EDIT logs which are for activity tracking
    const findAnyLogForDate = (date) => {
        return history.find(h => h.type !== 'EDIT' && new Date(h.timestamp).toDateString() === date.toDateString())
    }

    const getInputValue = (date, type, session) => {
        const key = getCellKey(date, type, session)
        if (edits[key] !== undefined) return edits[key] ?? ''

        if (type === 'REASON') {
            // Find reason from any log on this day
            const log = findAnyLogForDate(date)
            return log?.reason || ''
        }

        const log = findLog(date, type, session)
        if (log) {
            return formatHHMM(new Date(log.timestamp))
        }
        return ''
    }

    // The reason written for ONE overtime session. It lives on the session's logs
    // (otReason), separately from the day's Notes, so each OT says why.
    const getOTReason = (date, session) => {
        const key = getCellKey(date, 'OT_REASON', session)
        if (edits[key] !== undefined) return edits[key] ?? ''
        const log = [findLog(date, 'OT_IN', session), findLog(date, 'OT_OUT', session)].find(l => l?.otReason)
        return log?.otReason || ''
    }

    // Everything wrong with the OT sessions this save would touch. Only touched
    // ones: an old session without a reason must not block an unrelated edit.
    const findOTProblems = () => {
        const touched = new Map()
        for (const key of Object.keys(edits)) {
            const m = key.match(/^(.+)_(OT_IN|OT_OUT|OT_REASON)_(\d+)$/)
            if (m) touched.set(`${m[1]}|${m[3]}`, { dateStr: m[1], session: parseInt(m[3]) })
        }
        const found = []
        for (const { dateStr, session } of touched.values()) {
            const date = new Date(dateStr)
            checkOTSession({
                date,
                inTime: getInputValue(date, 'OT_IN', session),
                outTime: getInputValue(date, 'OT_OUT', session),
                reason: getOTReason(date, session),
            }, isWorkday).forEach(p => found.push({ date, session, ...p }))
        }
        return found.sort((a, b) => a.date - b.date || a.session - b.session)
    }

    const getDisplayValue = (date, type, session) => {
        if (type === 'REASON') {
            const log = findAnyLogForDate(date)
            return log?.reason || ''
        }

        const log = findLog(date, type, session)
        if (log) {
            return new Date(log.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
        }
        return ''
    }

    const handleEditChange = (date, type, value, session) => {
        setEdits(prev => ({
            ...prev,
            [getCellKey(date, type, session)]: value
        }))
    }

    // Immediate delete: removes the matching Firestore log right away. The table
    // re-reads history afterwards, so the cell instantly reflects the deletion.
    const handleCellDelete = async (date, type, session) => {
        const log = findLog(date, type, session)
        const key = getCellKey(date, type, session)
        if (!log) {
            // Nothing saved yet — just clear the pending edit
            setEdits(prev => {
                const next = { ...prev }
                delete next[key]
                return next
            })
            return
        }
        const res = await api.deleteLog(log.id)
        if (!res.success) {
            alert("Failed to delete entry: " + (res.message || 'unknown error'))
            return
        }
        // Drop any pending edit for this cell so it doesn't re-create on Save
        setEdits(prev => {
            const next = { ...prev }
            delete next[key]
            return next
        })
        if (onRefresh) await onRefresh()
    }

    // Removes an entire OT session (both its IN and OUT log, if present) in one go.
    const handleSessionDelete = async (date, session) => {
        const logIn = findLog(date, 'OT_IN', session)
        const logOut = findLog(date, 'OT_OUT', session)

        if (logIn) {
            const res = await api.deleteLog(logIn.id)
            if (!res.success) {
                alert("Failed to delete entry: " + (res.message || 'unknown error'))
                return
            }
        }
        if (logOut) {
            const res = await api.deleteLog(logOut.id)
            if (!res.success) {
                alert("Failed to delete entry: " + (res.message || 'unknown error'))
                return
            }
        }

        setEdits(prev => {
            const next = { ...prev }
            delete next[getCellKey(date, 'OT_IN', session)]
            delete next[getCellKey(date, 'OT_OUT', session)]
            return next
        })
        if (onRefresh) await onRefresh()
    }

    // Adds a fresh, empty OT session slot for this date (next available index).
    const handleAddSession = (date) => {
        const sessions = getOTSessionsForDate(date)
        const nextSession = Math.max(...sessions) + 1
        setEdits(prev => ({
            ...prev,
            [getCellKey(date, 'OT_IN', nextSession)]: '',
            [getCellKey(date, 'OT_OUT', nextSession)]: ''
        }))
    }

    const handleSmartFill = () => {
        if (!window.confirm("Auto-fill Regular Time (9:00 AM - 6:00 PM) for Mon-Fri?\n\nThis will fill entries for the displayed period (excluding weekends, holidays and days on leave). Existing entries won't be overwritten.")) return;

        const newEdits = { ...edits }

        // Define the limit: Use periodEnd if available, otherwise just fill the visible rows
        // We removed the restriction to stop at 'today'
        const limitDate = periodEnd ? new Date(periodEnd) : rows[rows.length - 1]

        rows.forEach(date => {
            // Check constraints
            const day = date.getDay()
            const isWeekend = day === 0 || day === 6
            const isFuture = date > limitDate

            // Only skip if it's strictly beyond the defined period end (if it exists)
            // or if it's a weekend. An approved leave/offset day is skipped too:
            // 9-to-6 would be wrong for someone who was off (or off part of it).
            if (!isWeekend && !isFuture && !leaveForDate(leaves, date) && !holidayOn(date)) {
                // key generators
                const keyIn = getCellKey(date, 'IN')
                const keyOut = getCellKey(date, 'OUT')

                // Check if already has value in edits OR history
                const hasInHistory = findLog(date, 'IN')
                const hasOutHistory = findLog(date, 'OUT')

                // Truthy check: treat blank ("") and null as fillable so Smart Fill
                // rescues cells the user (or a flaky time-picker) accidentally cleared.
                const hasInEdit = !!edits[keyIn]
                const hasOutEdit = !!edits[keyOut]

                if (!hasInHistory && !hasInEdit) newEdits[keyIn] = "09:00"
                if (!hasOutHistory && !hasOutEdit) newEdits[keyOut] = "18:00"
            }
        })

        setEdits(newEdits)
    }

    const handleClearRecords = () => {
        if (!window.confirm("Are you sure you want to CLEAR all records for this view?\n\nThis will mark all entries in the displayed period for deletion. You must click 'Save Changes' to confirm.")) return;

        const newEdits = { ...edits }

        rows.forEach(date => {
            // For every row in the current view, set all time fields to empty string
            // This triggers the delete logic in handleSave
            // null = explicit clear (vs "" which the time input can emit accidentally).
            newEdits[getCellKey(date, 'IN')] = null
            newEdits[getCellKey(date, 'OUT')] = null
            getOTSessionsForDate(date).forEach(session => {
                newEdits[getCellKey(date, 'OT_IN', session)] = null
                newEdits[getCellKey(date, 'OT_OUT', session)] = null
            })
            // Optionally clear reasons too?
            // const keyReason = getCellKey(date, 'REASON')
            // newEdits[keyReason] = ""
        })

        setEdits(newEdits)
    }

    const handleSave = async () => {
        const half = Object.entries(timeHints)
        if (half.length > 0) {
            const names = { IN: 'Time in', OUT: 'Time out', OT_IN: 'OT start', OT_OUT: 'OT end' }
            const lines = half.map(([key, hint]) => {
                const m = key.match(/^(.+?)_(OT_IN|OT_OUT|IN|OUT)(?:_(\d+))?$/)
                const day = m ? new Date(m[1]).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : key
                return `• ${day}, ${m ? names[m[2]] : 'time'}: ${hint}`
            })
            alert(`Nothing was saved. Finish these times first:\n\n${lines.join('\n')}`)
            return
        }
        // Refuse before anything is written: overtime inside regular hours, or
        // overtime with no reason. Nothing is half-saved.
        const problems = findOTProblems()
        if (problems.length > 0) {
            const lines = problems.map(p => `• ${p.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, OT ${p.session + 1}: ${p.message}`)
            alert(`Nothing was saved. Fix these first:\n\n${lines.join('\n')}`)
            return
        }
        setSaving(true)
        console.log("Saving edits:", edits)

        try {
            const editSummaryParts = []

            // 1. Parse edit keys into { dateStr, type, session }. OT keys carry a
            //    session index (`..._OT_IN_2`); IN/OUT/REASON never do.
            const parseEditKey = (key) => {
                let m = key.match(/^(.+)_(OT_IN|OT_OUT|OT_REASON)_(\d+)$/)
                if (m) return { dateStr: m[1], type: m[2], session: parseInt(m[3]) }
                m = key.match(/^(.+)_(IN|OUT|REASON)$/)
                if (m) return { dateStr: m[1], type: m[2], session: undefined }
                return null
            }

            const parsedEntries = Object.keys(edits)
                .map(key => ({ key, ...parseEditKey(key) }))
                .filter(p => p.dateStr)

            const datesToProcess = new Set(parsedEntries.map(p => p.dateStr))

            // 2. Build a plan: one entry per affected log/new log/delete
            const logUpdates = new Map() // logId -> { logId, log, newTimestamp?, newReason? }
            const newLogs = []           // { type, dateObj, timeStr, dateStr, reason, session? }
            const deletes = new Set()    // log ids
            const changedByDate = new Map() // dateStr -> changedFields[]

            const addChange = (dateStr, change) => {
                if (!changedByDate.has(dateStr)) changedByDate.set(dateStr, [])
                changedByDate.get(dateStr).push(change)
            }

            for (const dateStr of datesToProcess) {
                const dateObj = new Date(dateStr)
                const reason = edits[`${dateStr}_REASON`]
                const reasonEdited = reason !== undefined

                // Time edits
                const timeEntries = parsedEntries.filter(p => p.dateStr === dateStr && p.type !== 'REASON' && p.type !== 'OT_REASON')
                for (const { key, type, session } of timeEntries) {
                    const timeStr = edits[key]
                    if (timeStr === undefined) continue

                    const matchingLogs = findAllLogs(dateObj, type, session)
                    const label = session !== undefined ? `OT session ${session + 1} ${type === 'OT_IN' ? 'IN' : 'OUT'}` : type

                    // null = explicit "Clear" button sentinel. "" = user actively cleared
                    // this individual time input. Both mean: delete the log.
                    if (timeStr === null || timeStr === '') {
                        if (matchingLogs.length > 0) {
                            matchingLogs.forEach(log => deletes.add(log.id))
                            addChange(dateStr, `${label} cleared`)
                        }
                        continue
                    }

                    if (matchingLogs.length > 0) {
                        matchingLogs.forEach(log => {
                            const [h, m] = timeStr.split(':')
                            const newDate = new Date(log.timestamp)
                            newDate.setHours(parseInt(h), parseInt(m))
                            const u = logUpdates.get(log.id) || { logId: log.id, log }
                            u.newTimestamp = newDate
                            logUpdates.set(log.id, u)
                        })
                        addChange(dateStr, `${label} → ${timeStr}`)
                    } else {
                        newLogs.push({ type, dateObj, timeStr, dateStr, reason: undefined, session })
                        addChange(dateStr, `${label} set to ${timeStr}`)
                    }
                }

                // The reason for each OT session touched today, stored on that session's
                // logs (both of them, so deleting one half keeps it).
                const touchedSessions = [...new Set(parsedEntries.filter(p => p.dateStr === dateStr && p.session !== undefined).map(p => p.session))]
                for (const session of touchedSessions) {
                    const finalReason = getOTReason(dateObj, session).trim()
                    let changed = false
                    history.filter(h =>
                        (h.type === 'OT_IN' || h.type === 'OT_OUT') &&
                        (h.session || 0) === session &&
                        new Date(h.timestamp).toDateString() === dateObj.toDateString() &&
                        !deletes.has(h.id)
                    ).forEach(log => {
                        if ((log.otReason || '') !== finalReason) {
                            const u = logUpdates.get(log.id) || { logId: log.id, log }
                            u.newOtReason = finalReason
                            logUpdates.set(log.id, u)
                            changed = true
                        }
                    })
                    newLogs.filter(nl => nl.dateStr === dateStr && nl.session === session).forEach(nl => { nl.otReason = finalReason; changed = true })
                    if (changed && finalReason) addChange(dateStr, `OT session ${session + 1} reason: ${finalReason}`)
                }

                // Propagate reason to every surviving log on this day
                if (reasonEdited) {
                    const dayLogs = history.filter(h =>
                        h.type !== 'EDIT' &&
                        new Date(h.timestamp).toDateString() === dateObj.toDateString()
                    )
                    const survivingLogs = dayLogs.filter(log => !deletes.has(log.id))

                    if (survivingLogs.length > 0) {
                        survivingLogs.forEach(log => {
                            const u = logUpdates.get(log.id) || { logId: log.id, log }
                            u.newReason = reason
                            logUpdates.set(log.id, u)
                        })
                        addChange(dateStr, `Notes updated`)
                    }

                    const newOnThisDay = newLogs.filter(nl => nl.dateStr === dateStr)
                    newOnThisDay.forEach(nl => { nl.reason = reason })

                    if (survivingLogs.length === 0 && newOnThisDay.length === 0) {
                        newLogs.push({ type: 'NOTE', dateObj, timeStr: '12:00', dateStr, reason })
                        addChange(dateStr, `Notes added`)
                    }
                }
            }

            // 3. New logs without an explicit reason inherit the day's existing reason
            //    (prevents Smart Fill / blank-cell fills from displacing pre-existing notes)
            for (const nl of newLogs) {
                if (nl.reason === undefined) {
                    const existing = findAnyLogForDate(nl.dateObj)
                    nl.reason = existing?.reason || ''
                }
            }

            // 4. Build atomic batch (single Firestore commit — either everything
            //    applies or nothing does, so we can't end up with a fragmented day).
            const batchUpdates = []
            for (const u of logUpdates.values()) {
                if (deletes.has(u.logId)) continue
                batchUpdates.push({
                    logId: u.logId,
                    newTimestamp: u.newTimestamp || new Date(u.log.timestamp),
                    newReason: u.newReason,
                    newOtReason: u.newOtReason
                })
            }

            // 5. Build edit summary for activity log
            for (const [dateStr, changes] of changedByDate.entries()) {
                const dateLabel = new Date(dateStr).toLocaleDateString('en-GB')
                editSummaryParts.push(`${dateLabel}: ${changes.join(', ')}`)
            }

            await api.saveDTRBatch(user.id, {
                updates: batchUpdates,
                creates: newLogs.map(nl => ({
                    type: nl.type,
                    dateObj: nl.dateObj,
                    timeStr: nl.timeStr,
                    reason: nl.reason || '',
                    session: nl.session,
                    otReason: nl.otReason
                })),
                deletes: [...deletes]
            })

            // Log the edit activity to Recent Activity
            if (editSummaryParts.length > 0) {
                const summary = editSummaryParts.length === 1
                    ? editSummaryParts[0]
                    : `Updated records for ${editSummaryParts.length} days`;
                
                // Build structured details for the detail modal
                const details = editSummaryParts.map(part => {
                    const [dateLabel, ...rest] = part.split(': ')
                    return { date: dateLabel, changes: rest.join(': ') }
                })
                
                await api.logEditActivity(user.id, summary, details)
            }

            alert("Changes saved successfully!")
            setEdits({})
            setEditMode(false)
            if (onRefresh) await onRefresh()

        } catch (err) {
            console.error("Save failed", err)
            alert("Error saving: " + err.message)
        } finally {
            setSaving(false)
        }
    }

    const handleCancel = () => {
        setEdits({})
        setEditMode(false)
    }

    const formatDateForInput = (date) => {
        return date.toISOString().split('T')[0]
    }

    const handleDateChange = (e) => {
        const newDate = new Date(e.target.value)
        if (!isNaN(newDate)) {
            setAnchorDate(newDate)
        }
    }

    return (
        <div className="bg-[var(--surface-1)] rounded-3xl border border-[var(--border)] overflow-hidden">
            {/* Header Metadata Area */}
            <div className="p-4 sm:p-6 border-b border-[var(--border)] flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h3 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] tracking-tight">DAILY TIME RECORD</h3>
                    <div className="flex flex-wrap md:flex-nowrap items-center gap-2 mt-1">
                        <span className="text-[var(--text-muted)] text-xs uppercase tracking-widest">Period Start Date:</span>
                        {/* Date Picker */}
                        <input
                            type="date"
                            className="bg-[var(--surface-3)] text-[var(--text-primary)] text-xs px-2 py-1 rounded border border-[var(--border-strong)] focus:outline-none focus:border-[var(--accent-purple)]"
                            value={formatDateForInput(anchorDate)}
                            onChange={handleDateChange}
                        />
                    </div>
                    {/* Holiday outline key — only the kinds that are in this period */}
                    {holidayTypesInView.length > 0 && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 text-[11px] text-[var(--text-secondary)]" aria-label="Holiday outline colours">
                            <span className="font-bold uppercase tracking-widest text-[10px] text-[var(--text-muted)]">Outlined rows</span>
                            {holidayTypesInView.map(t => (
                                <span key={t} className="flex items-center gap-1.5">
                                    <span aria-hidden="true" className="w-3 h-3 rounded-[4px] border-2" style={{ borderColor: HOLIDAY_TYPES[t].color }} />
                                    {HOLIDAY_TYPES[t].label}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap md:flex-nowrap items-center gap-2">
                    {editMode ? (
                        <>
                            <button
                                onClick={handleSmartFill}
                                className="flex items-center gap-2 px-4 py-2.5 md:py-2 rounded-xl bg-[var(--accent-yellow)]/10 text-[var(--accent-yellow)] hover:bg-[var(--accent-yellow)]/20 text-sm font-bold transition-colors border border-[var(--accent-yellow)]/20"
                                title="Auto-fill Mon-Fri (9am-6pm)"
                            >
                                <Zap size={16} />
                                <span className="hidden sm:inline">Smart Fill</span>
                            </button>
                            <button
                                onClick={handleClearRecords}
                                className="flex items-center gap-2 px-4 py-2.5 md:py-2 rounded-xl bg-[var(--accent-red)]/10 text-[var(--accent-red)] hover:bg-[var(--accent-red)]/20 text-sm font-bold transition-colors border border-[var(--accent-red)]/20"
                                title="Clear all records in view"
                            >
                                <Trash2 size={16} />
                                <span className="hidden sm:inline">Clear</span>
                            </button>
                            <button
                                onClick={handleCancel}
                                disabled={saving}
                                className="flex items-center gap-2 px-4 py-2.5 md:py-2 rounded-xl bg-[var(--surface-3)] text-[var(--text-secondary)] hover:bg-[var(--surface-3-hover)] text-sm font-bold transition-colors"
                            >
                                <X size={16} />
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex items-center gap-2 px-4 py-2.5 md:py-2 rounded-xl bg-[var(--accent-green)] text-black hover:bg-[var(--accent-green)]/90 text-sm font-bold transition-colors shadow-lg shadow-green-900/20"
                            >
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Save Changes
                            </button>
                        </>
                    ) : canEdit ? (
                        <button
                            onClick={() => setEditMode(true)}
                            className="flex items-center gap-2 px-4 py-2.5 md:py-2 rounded-xl bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/20 border border-[var(--accent-purple)]/50 text-sm font-bold transition-colors"
                        >
                            <Pencil size={16} />
                            Edit Records
                        </button>
                    ) : null}
                </div>
            </div>

            {/* Restored draft notice */}
            {restoredDraft && editMode && (
                <div className="px-4 sm:px-6 py-2 bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] text-xs font-medium flex items-start sm:items-center justify-between gap-2 border-b border-[var(--border)]">
                    <span>Restored unsaved changes from your last session — click Save Changes to keep them, or Cancel to discard.</span>
                    <button
                        type="button"
                        onClick={() => setRestoredDraft(false)}
                        className="hover:text-[var(--text-primary)] shrink-0 ml-2"
                        title="Dismiss"
                    >
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* Swipe hint — the grid below scrolls sideways on phones. */}
            <p className="md:hidden px-4 pt-3 text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                Swipe the table sideways to see overtime and notes
            </p>

            {editMode && (
                <p className="px-4 sm:px-6 pt-3 text-[11px] text-[var(--text-muted)]">
                    Type the numbers of the time, like <strong className="text-[var(--text-secondary)]">930</strong>, then tap AM or PM (or press A or P). Press ↑ or ↓ to move it 15 minutes.
                </p>
            )}

            {/* The Grid */}
            <div className="overflow-x-auto overscroll-x-contain">
                <table className="w-full min-w-[840px] text-center border-collapse">
                    <thead>
                        {/* Top Level Headers */}
                        <tr className="border-b border-[var(--border)]">
                            <th className="p-3 bg-[var(--surface-2)] text-[var(--text-secondary)] font-medium text-xs w-32 border-r border-[var(--border)]">DAY</th>
                            <th className="p-3 bg-[var(--surface-2)] text-[var(--text-secondary)] font-medium text-xs w-32 border-r border-[var(--border)]">DATE</th>

                            <th colSpan={2} className="p-2 border-r border-[var(--border)] bg-[var(--accent-green)]/5">
                                <div className="text-[var(--accent-green)] font-bold text-xs uppercase tracking-wider">Regular Time</div>
                            </th>

                            <th colSpan={2} className="p-2 border-r border-[var(--border)] bg-[var(--accent-purple)]/5">
                                <div className="text-[var(--accent-purple)] font-bold text-xs uppercase tracking-wider">Overtime</div>
                            </th>
                            <th className="p-3 bg-[var(--surface-2)] text-[var(--text-secondary)] font-medium text-xs border-r border-[var(--border)]">REASON / NOTES</th>
                        </tr>

                        <tr className="border-b border-[var(--border)] text-xs font-semibold">
                            <th className="bg-[var(--surface-1)] border-r border-[var(--border)]"></th>
                            <th className="bg-[var(--surface-1)] border-r border-[var(--border)]"></th>

                            <th className="py-2 text-[var(--accent-green)] bg-[var(--accent-green)]/5 border-r border-[var(--border)] border-dashed border-white/10 w-32">IN</th>
                            <th className="py-2 text-[var(--accent-green)] bg-[var(--accent-green)]/5 border-r border-[var(--border)] w-32">OUT</th>

                            <th colSpan={2} className="py-2 text-[var(--accent-purple)] bg-[var(--accent-purple)]/5 border-r border-[var(--border)] w-32">SESSIONS</th>
                            <th className="bg-[var(--surface-1)]"></th>
                        </tr>
                    </thead>
                    <tbody className="text-sm">
                        {rows.map((date, i) => {
                            const leave = leaveForDate(leaves, date)
                            const dayKey = toYMD(date)
                            const flagged = !!flaggedDays && flaggedDays.includes(dayKey)
                            // A whole-day leave with nothing clocked reads "SL"/"VL" in
                            // the time cells instead of a bare dash. Offset is partial,
                            // so it keeps the dash and shows only the badge.
                            const dayOffLabel = leave && leave.type !== 'offset' && !isPartialDay(leave) ? LEAVE_TYPES[leave.type].short : null
                            const dayOffCell = dayOffLabel
                                ? <span className="font-bold text-xs tracking-wider" style={{ color: LEAVE_TYPES[leave.type].color }} title={LEAVE_TYPES[leave.type].label}>{dayOffLabel}</span>
                                : '-'
                            const holiday = holidayOn(date)
                            const hType = holiday ? HOLIDAY_TYPES[holiday.type] : null
                            // A coloured outline round the whole row, drawn per cell (inset
                            // shadows) because a table row can't carry its own border
                            // reliably. pos: 'first' / 'last' close the row's two ends.
                            const edge = (pos, tint = false) => {
                                if (!hType) return undefined
                                const c = hType.color
                                const lines = [`inset 0 2px 0 ${c}`, `inset 0 -2px 0 ${c}`]
                                if (pos === 'first') lines.push(`inset 2px 0 0 ${c}`)
                                if (pos === 'last') lines.push(`inset -2px 0 0 ${c}`)
                                return { boxShadow: lines.join(', '), ...(tint ? { background: `color-mix(in srgb, ${c} 9%, transparent)` } : null) }
                            }
                            return (
                            <tr
                                key={i}
                                data-dtr-day={dayKey}
                                className={`border-b border-[var(--border)] group hover:bg-white/5 transition-colors ${flagged ? 'bg-[var(--accent-amber)]/5 shadow-[inset_3px_0_0_var(--accent-amber)]' : ''}`}
                            >
                                {/* Day */}
                                <td style={edge('first', true)} className="py-4 text-[var(--text-primary)] border-r border-[var(--border)] font-bold text-left px-4 text-base">
                                    {date.toLocaleDateString('en-GB', { weekday: 'long' })}
                                    {leave && (
                                        <span
                                            className="block mt-1 w-fit px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                                            style={{ color: LEAVE_TYPES[leave.type].color, background: `color-mix(in srgb, ${LEAVE_TYPES[leave.type].color} 14%, transparent)` }}
                                            title={`${LEAVE_TYPES[leave.type].label} — approved${leave.reviewerName ? ` by ${leave.reviewerName}` : ''}`}
                                        >
                                            {leave.type === 'offset' || isPartialDay(leave) ? dtrLabel(leave) : LEAVE_TYPES[leave.type].label}
                                        </span>
                                    )}
                                    {holiday && (
                                        <span
                                            className="block mt-1 w-fit max-w-[12rem] px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider leading-snug"
                                            style={{ color: hType.color, background: `color-mix(in srgb, ${hType.color} 16%, transparent)` }}
                                            title={`${hType.label}: ${holiday.name}`}
                                        >
                                            {holiday.name}{holiday.days > 1 ? ` (${holiday.day}/${holiday.days})` : ''}
                                        </span>
                                    )}
                                </td>
                                {/* Date */}
                                <td style={edge(undefined, true)} className="py-4 text-[var(--text-primary)] border-r border-[var(--border)] font-mono text-center text-base">
                                    {date.toLocaleDateString('en-GB')}
                                </td>

                                {/* Regular IN */}
                                <td style={edge()} className="p-0 border-r border-[var(--border)] border-dashed border-white/10 bg-[var(--accent-green)]/5 font-mono h-12">
                                    {editMode ? (
                                        <div className="h-12">
                                            <TimeCellEditor
                                                value={getInputValue(date, 'IN')}
                                                onChange={(v) => handleEditChange(date, 'IN', v)}
                                                onDelete={() => handleCellDelete(date, 'IN')}
                                                onHint={(h) => setHint(getCellKey(date, 'IN'), h)}
                                                ringColor="var(--accent-green)"
                                            />
                                        </div>
                                    ) : (
                                        <div className="py-3 text-[var(--text-primary)]">{getDisplayValue(date, 'IN') || dayOffCell}</div>
                                    )}
                                </td>

                                {/* Regular OUT */}
                                <td style={edge()} className="p-0 border-r border-[var(--border)] bg-[var(--accent-green)]/5 font-mono h-12">
                                    {editMode ? (
                                        <div className="h-12">
                                            <TimeCellEditor
                                                value={getInputValue(date, 'OUT')}
                                                onChange={(v) => handleEditChange(date, 'OUT', v)}
                                                onDelete={() => handleCellDelete(date, 'OUT')}
                                                onHint={(h) => setHint(getCellKey(date, 'OUT'), h)}
                                                ringColor="var(--accent-green)"
                                            />
                                        </div>
                                    ) : (
                                        <div className="py-3 text-[var(--text-primary)]">{getDisplayValue(date, 'OUT') || dayOffCell}</div>
                                    )}
                                </td>

                                {/* Overtime — one or more sessions per day, each row matching the
                                    h-12 height/flush edges of the Regular Time cells beside it */}
                                <td colSpan={2} style={edge()} className="p-0 border-r border-[var(--border)] bg-[var(--accent-purple)]/5 font-mono align-middle">
                                    {editMode ? (
                                        <div className="flex flex-col divide-y divide-[var(--border)]/60">
                                            {getOTSessionsForDate(date).map(session => {
                                                const inV = getInputValue(date, 'OT_IN', session)
                                                const outV = getInputValue(date, 'OT_OUT', session)
                                                const reasonV = getOTReason(date, session)
                                                const hasTimes = !!(inV || outV)
                                                const problems = hasTimes ? checkOTSession({ date, inTime: inV, outTime: outV, reason: reasonV }, isWorkday) : []
                                                const workProblem = problems.find(p => p.kind === 'work-time')
                                                const needsReason = problems.some(p => p.kind === 'reason')
                                                return (
                                                <div key={session} className="px-2 py-2 min-h-12 flex flex-col justify-center gap-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-36 h-8 shrink-0">
                                                            <TimeCellEditor
                                                                value={inV}
                                                                onChange={(v) => handleEditChange(date, 'OT_IN', v, session)}
                                                                onDelete={() => handleCellDelete(date, 'OT_IN', session)}
                                                                onHint={(h) => setHint(getCellKey(date, 'OT_IN', session), h)}
                                                                ringColor="var(--accent-purple)"
                                                            />
                                                        </div>
                                                        <span className="text-[var(--text-muted)] text-xs shrink-0">-</span>
                                                        <div className="w-36 h-8 shrink-0">
                                                            <TimeCellEditor
                                                                value={outV}
                                                                onChange={(v) => handleEditChange(date, 'OT_OUT', v, session)}
                                                                onDelete={() => handleCellDelete(date, 'OT_OUT', session)}
                                                                onHint={(h) => setHint(getCellKey(date, 'OT_OUT', session), h)}
                                                                ringColor="var(--accent-purple)"
                                                            />
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSessionDelete(date, session)}
                                                            title="Remove this OT session"
                                                            className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--accent-red)]/20 hover:text-[var(--accent-red)] transition-colors"
                                                        >
                                                            <Trash2 size={11} />
                                                        </button>
                                                    </div>
                                                    {hasTimes && (
                                                        <input
                                                            type="text"
                                                            maxLength={200}
                                                            required
                                                            aria-label={`Reason for overtime session ${session + 1}`}
                                                            placeholder="Reason for this overtime (required)"
                                                            value={reasonV}
                                                            onChange={(e) => handleEditChange(date, 'OT_REASON', e.target.value, session)}
                                                            className={`w-full h-8 rounded bg-black/50 text-white px-2 text-xs font-sans focus:outline-none focus:ring-1 ring-[var(--accent-purple)] ${needsReason ? 'ring-1 ring-[var(--accent-red)]' : ''}`}
                                                        />
                                                    )}
                                                    {[['Start', 'OT_IN'], ['End', 'OT_OUT']].map(([label, type]) => {
                                                        const hint = timeHints[getCellKey(date, type, session)]
                                                        return hint ? (
                                                            <p key={type} role="alert" className="flex items-start gap-1 text-[10px] font-bold font-sans leading-snug text-[var(--accent-amber)]">
                                                                <AlertTriangle size={11} className="shrink-0 mt-px" />
                                                                {label}: {hint}
                                                            </p>
                                                        ) : null
                                                    })}
                                                    {workProblem && (
                                                        <p role="alert" className="flex items-start gap-1 text-[10px] font-bold font-sans leading-snug text-[var(--accent-red)]">
                                                            <AlertTriangle size={11} className="shrink-0 mt-px" />
                                                            {workProblem.message}
                                                        </p>
                                                    )}
                                                </div>
                                                )
                                            })}
                                            <div className="px-2 py-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleAddSession(date)}
                                                    className="text-[10px] text-[var(--accent-purple)] hover:text-[var(--text-primary)] flex items-center gap-1"
                                                >
                                                    <Plus size={11} />
                                                    Add session
                                                </button>
                                            </div>
                                        </div>
                                    ) : getVisibleOTSessions(date).length > 0 ? (
                                        <>
                                            <div className="flex flex-col divide-y divide-[var(--border)]/60">
                                                {getVisibleOTSessions(date).map(session => {
                                                    const overlap = overlapBySession.get(`${dayKey}_${session}`)
                                                    const reasonText = getOTReason(date, session)
                                                    return (
                                                        <div key={session} className="min-h-12 py-1.5 flex flex-col items-center justify-center px-3 text-[var(--text-primary)] text-center">
                                                            <span>{getDisplayValue(date, 'OT_IN', session) || '–'} – {getDisplayValue(date, 'OT_OUT', session) || '–'}</span>
                                                            {reasonText ? (
                                                                <span className="mt-0.5 text-[11px] font-sans text-[var(--text-secondary)] whitespace-pre-wrap break-words">{reasonText}</span>
                                                            ) : canEdit ? (
                                                                <span className="mt-0.5 flex items-center gap-1 text-[10px] font-bold font-sans text-[var(--accent-amber)]"><AlertTriangle size={10} /> Reason needed — edit to add one</span>
                                                            ) : (
                                                                <span className="mt-0.5 text-[10px] font-sans text-[var(--text-muted)]">No reason given</span>
                                                            )}
                                                            {overlap && (
                                                                <span className="mt-0.5 flex items-start gap-1 text-[10px] font-bold font-sans text-[var(--accent-amber)]">
                                                                    <AlertTriangle size={10} className="shrink-0 mt-px" />
                                                                    {overlap.countedMinutes > 0
                                                                        ? `Runs into regular hours — ${formatDuration(overlap.overlapMinutes)} not counted`
                                                                        : 'Inside regular hours — not counted'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                            {((otTotals && otTotals[dayKey] > 0) || flagged) && (
                                                <div className="px-2 py-1.5 border-t border-[var(--border)]/60 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] font-bold font-sans">
                                                    {otTotals && otTotals[dayKey] > 0 && (
                                                        <span className="text-[var(--accent-purple)]">Total {formatDuration(otTotals[dayKey])}</span>
                                                    )}
                                                    {flagged && (
                                                        <span className="flex items-center gap-1 text-[var(--accent-amber)]"><AlertTriangle size={10} /> Incomplete OT — not counted</span>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="h-12 flex items-center justify-center text-[var(--text-primary)]">-</div>
                                    )}
                                </td>

                                {/* Reason / Notes */}
                                <td style={edge('last')} className="p-0 border-r border-[var(--border)] text-[var(--text-secondary)] font-mono">
                                    {editMode ? (
                                        <div className="p-2">
                                            <input
                                                type="text"
                                                placeholder={leave ? leaveNote(leave) : 'Notes for the day'}
                                                className="w-full h-9 rounded bg-black/50 text-white px-2 text-xs font-sans focus:outline-none focus:bg-black focus:ring-1 ring-slate-500"
                                                value={getInputValue(date, 'REASON')}
                                                onChange={(e) => handleEditChange(date, 'REASON', e.target.value)}
                                            />
                                        </div>
                                    ) : (
                                        <div className="py-3 px-2 text-xs text-[var(--text-primary)] whitespace-pre-wrap break-words" title={getDisplayValue(date, 'REASON')}>
                                            {/* The leave line is always shown with its reason, above
                                                whatever note the day already has, so neither hides the other. */}
                                            {leave && (
                                                <span className="block font-bold" style={{ color: LEAVE_TYPES[leave.type].color }}>
                                                    {leaveNote(leave)}
                                                </span>
                                            )}
                                            {getDisplayValue(date, 'REASON')}
                                        </div>
                                    )}
                                </td>
                            </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

// One field to type a time into, with an AM / PM toggle beside it, instead of
// three dropdowns (a minute list of 00–59 is slow to use and got clipped at the
// edge of the table). It only lets NUMBERS in — the colon is put in for you as you
// type ("930" shows "9:30") and a time that can't exist (minutes past 59) is
// refused as it is typed. AM / PM is the toggle, or the A and P keys. ↑ / ↓ nudge
// the time by 15 minutes. On a phone the number pad comes up.
//
// It still follows the rule the dropdowns were built for: Safari's native time
// field committed "9:00 PM" as 9:00 AM before AM/PM was chosen. Here the parent
// only hears a time once the hour, minutes AND AM/PM are all known (or '' once
// it is emptied); anything half-entered stays here, outlined in amber, and
// never reaches the save.
function TimeSelect({ value, onChange, onHint, ringColor }) {
    const initial = parseTime(value)
    const [text, setText] = useState(initial.h ? formatClock(initial) : '')
    const [ap, setAp] = useState(initial.p)
    const lastEmitted = useRef(value || '')

    // Follow the value when it changes from outside (Save, Cancel, Smart Fill, a
    // restored draft). What this field itself just sent doesn't count, so typing
    // is never overwritten mid-keystroke.
    useEffect(() => {
        if ((value || '') === lastEmitted.current) return
        const p = parseTime(value)
        setText(p.h ? formatClock(p) : '')
        setAp(p.p)
        lastEmitted.current = value || ''
    }, [value])

    const parsed = parseTypedTime(text)
    const finalAp = parsed?.p || ap
    const complete = !!(parsed && finalAp)
    const incomplete = (text.trim() !== '' || ap !== '') && !complete
    const hint = !incomplete ? undefined
        : text.trim() === '' ? 'Type the time, like 9:30'
        : !parsed ? 'Type the minutes as two digits, like 9:30'
        : 'Choose AM or PM'

    const emit = (v) => { lastEmitted.current = v; onChange(v) }

    // Tell the table when this box is half-entered, and when it stops being.
    const hintRef = useRef(onHint)
    hintRef.current = onHint
    useEffect(() => { hintRef.current?.(hint || null) }, [hint])
    useEffect(() => () => hintRef.current?.(null), [])

    // Text typed (or stepped): tell the parent when it is a whole time, or empty.
    const typed = (nextText, nextAp) => {
        const p = parseTypedTime(nextText)
        const useAp = p?.p || nextAp
        setText(nextText)
        setAp(nextText.trim() === '' ? '' : useAp)
        if (p && useAp) emit(toTime24({ h: p.h, m: p.m, p: useAp }))
        else if (nextText.trim() === '') emit('')
    }

    const pickAp = (choice) => {
        setAp(choice)
        const p = parseTypedTime(text)
        if (p) emit(toTime24({ h: p.h, m: p.m, p: choice }))
    }

    const onKeyDown = (e) => {
        // A and P choose AM / PM without leaving the keyboard (they are never typed into the box)
        if (!e.ctrlKey && !e.metaKey && !e.altKey && /^[ap]$/i.test(e.key)) { e.preventDefault(); pickAp(e.key.toLowerCase() === 'a' ? 'AM' : 'PM'); return }
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
        e.preventDefault()
        if (!complete) return
        const next = stepTime24(toTime24({ h: parsed.h, m: parsed.m, p: finalAp }), e.key === 'ArrowUp' ? 15 : -15)
        const np = parseTime(next)
        setText(formatClock(np)); setAp(np.p); emit(next)
    }

    // Leaving the field tidies what was typed: "930" -> "9:30".
    const onBlur = () => { if (parsed) setText(formatClock(parsed)) }

    const toggle = (label) => (
        <button
            key={label}
            type="button"
            tabIndex={-1}
            aria-pressed={finalAp === label}
            onClick={() => pickAp(label)}
            className={`h-6 px-1.5 rounded text-[10px] font-bold leading-none transition-colors ${finalAp === label ? 'text-black' : 'text-white/45 hover:text-white'}`}
            style={finalAp === label ? { background: ringColor } : undefined}
        >
            {label}
        </button>
    )

    return (
        <div
            className="flex items-center justify-center gap-1.5 w-full h-full bg-black/50 pl-1 pr-6 focus-within:ring-1"
            style={{ '--tw-ring-color': incomplete ? 'var(--accent-amber)' : ringColor, ...(incomplete ? { boxShadow: 'inset 0 0 0 1px var(--accent-amber)' } : null) }}
            title={hint}
        >
            <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label="Time, for example 9:30"
                placeholder="h:mm"
                value={text}
                onChange={(e) => {
                    const next = formatTypedDigits(e.target.value)
                    if (next !== null) typed(next, ap) // null: that keystroke can't be part of a time
                }}
                onPaste={(e) => {
                    // "9:30 pm" pasted whole is understood; anything else is ignored
                    e.preventDefault()
                    const p = parseTypedTime(e.clipboardData?.getData('text'))
                    if (p) typed(formatClock(p), p.p || ap)
                }}
                onFocus={(e) => e.target.select()}
                onBlur={onBlur}
                onKeyDown={onKeyDown}
                maxLength={5}
                className="w-12 min-w-0 h-6 bg-transparent text-white text-center text-xs font-mono placeholder:text-white/30 focus:outline-none"
            />
            <div role="group" aria-label="AM or PM" className="flex items-center gap-px shrink-0">
                {['AM', 'PM'].map(toggle)}
            </div>
        </div>
    )
}

// Time input with an explicit delete button. Clicking × calls onDelete which
// removes the matching Firestore log immediately (no batched-save dance).
function TimeCellEditor({ value, onChange, onDelete, onHint, ringColor }) {
    const hasValue = value !== '' && value != null
    const [deleting, setDeleting] = useState(false)

    const handleDeleteClick = async () => {
        if (deleting) return
        setDeleting(true)
        try {
            await onDelete()
        } finally {
            setDeleting(false)
        }
    }

    return (
        <div className="relative w-full h-full">
            <TimeSelect value={value} onChange={onChange} onHint={onHint} ringColor={ringColor} />
            {hasValue && (
                <button
                    type="button"
                    onClick={handleDeleteClick}
                    disabled={deleting}
                    title="Delete this entry"
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full bg-[var(--accent-red)]/20 text-[var(--accent-red)] hover:bg-[var(--accent-red)] hover:text-white text-[10px] leading-none transition-colors disabled:opacity-50"
                >
                    {deleting ? <Loader2 size={10} className="animate-spin" /> : <X size={10} strokeWidth={3} />}
                </button>
            )}
        </div>
    )
}
