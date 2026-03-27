import { useState, useEffect, useMemo } from 'react'
import { Pencil, Save, X, Loader2, Zap, Trash2 } from 'lucide-react'
import { api } from '../services/api'

export default function DTRTable({ user, history, onRefresh, initialDate, periodEnd }) {
    const [editMode, setEditMode] = useState(false)
    const [edits, setEdits] = useState({}) // Key: "YYYY-MM-DD_TYPE", Value: "HH:MM" or "REASON_TEXT"
    const [saving, setSaving] = useState(false)
    const [anchorDate, setAnchorDate] = useState(new Date())

    // Sync anchorDate with initialDate if provided
    useEffect(() => {
        if (initialDate) {
            setAnchorDate(new Date(initialDate))
        } else {
            setAnchorDate(new Date())
        }
    }, [initialDate])

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

    const getCellKey = (date, type) => `${date.toDateString()}_${type}`

    // Helper to find existing log in history
    const findLog = (date, type) => {
        return history.find(h =>
            new Date(h.timestamp).toDateString() === date.toDateString() &&
            h.type === type
        )
    }

    // Helper to find ANY log for a specific date (to get/set reason)
    const findAnyLogForDate = (date) => {
        return history.find(h => new Date(h.timestamp).toDateString() === date.toDateString())
    }

    const getInputValue = (date, type) => {
        const key = getCellKey(date, type)
        if (edits[key] !== undefined) return edits[key]

        if (type === 'REASON') {
            // Find reason from any log on this day
            const log = findAnyLogForDate(date)
            return log?.reason || ''
        }

        const log = findLog(date, type)
        if (log) {
            return new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
        }
        return ''
    }

    const getDisplayValue = (date, type) => {
        if (type === 'REASON') {
            const log = findAnyLogForDate(date)
            return log?.reason || ''
        }

        const log = findLog(date, type)
        if (log) {
            return new Date(log.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
        }
        return ''
    }

    const handleEditChange = (date, type, value) => {
        setEdits(prev => ({
            ...prev,
            [getCellKey(date, type)]: value
        }))
    }

    const handleSmartFill = () => {
        if (!window.confirm("Auto-fill Regular Time (9:00 AM - 6:00 PM) for Mon-Fri?\n\nThis will fill entries for the displayed period (excluding weekends). Existing entries won't be overwritten.")) return;

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
            // or if it's a weekend
            if (!isWeekend && !isFuture) {
                // key generators
                const keyIn = getCellKey(date, 'IN')
                const keyOut = getCellKey(date, 'OUT')

                // Check if already has value in edits OR history
                const hasInHistory = findLog(date, 'IN')
                const hasOutHistory = findLog(date, 'OUT')

                const hasInEdit = edits[keyIn] !== undefined
                const hasOutEdit = edits[keyOut] !== undefined

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
            const types = ['IN', 'OUT', 'OT_IN', 'OT_OUT']
            types.forEach(type => {
                const key = getCellKey(date, type)
                newEdits[key] = ""
            })
            // Optionally clear reasons too?
            // const keyReason = getCellKey(date, 'REASON')
            // newEdits[keyReason] = "" 
        })

        setEdits(newEdits)
    }

    const handleSave = async () => {
        setSaving(true)
        console.log("Saving edits:", edits)

        try {
            // Group edits by date to handle "Reason" correctly
            // We need to process time edits first, then attach reasons if needed

            const promises = []

            // 1. Identify distinct dates being edited
            const editKeys = Object.keys(edits)
            const datesToProcess = new Set()
            editKeys.forEach(key => {
                const separatorIndex = key.lastIndexOf('_')
                const dateStr = key.substring(0, separatorIndex)
                datesToProcess.add(dateStr)
            })

            for (const dateStr of datesToProcess) {
                const dateObj = new Date(dateStr)

                // Get all edits for this date
                const inTime = edits[`${dateStr}_IN`]
                const outTime = edits[`${dateStr}_OUT`]
                const otInTime = edits[`${dateStr}_OT_IN`]
                const otOutTime = edits[`${dateStr}_OT_OUT`]
                const reason = edits[`${dateStr}_REASON`]

                // Process Times
                const timeTypes = ['IN', 'OUT', 'OT_IN', 'OT_OUT']
                for (const type of timeTypes) {
                    const timeStr = edits[`${dateStr}_${type}`]
                    if (timeStr !== undefined) { // Explicitly checked for presence in edits
                        const existingLog = findLog(dateObj, type)

                        // Case 1: Cleared value (delete)
                        if (timeStr === '') {
                            if (existingLog) {
                                promises.push(api.deleteLog(existingLog.id))
                            }
                            continue; // Skip creating/updating with empty value
                        }

                        // Case 2: Update or Create
                        // Use the edited reason, or preserve existing reason if not edited
                        let reasonToSave = undefined
                        if (reason !== undefined) reasonToSave = reason

                        if (existingLog) {
                            // Update
                            const [h, m] = timeStr.split(':')
                            const newDate = new Date(existingLog.timestamp)
                            newDate.setHours(parseInt(h), parseInt(m))
                            promises.push(api.updateLog(existingLog.id, newDate, reasonToSave))
                        } else {
                            // Create
                            promises.push(api.createLog(user.id, type, dateObj, timeStr, reasonToSave || ''))
                        }
                    }
                }

                // Process Reason ONLY (if no times were edited/added but reason was changed)
                // We need to find an existing log to update its reason
                if (reason !== undefined) {
                    const timeEditsForDate = timeTypes.some(t => edits[`${dateStr}_${t}`] !== undefined)
                    if (!timeEditsForDate) {
                        const anyLog = findAnyLogForDate(dateObj)
                        if (anyLog) {
                            promises.push(api.updateLog(anyLog.id, new Date(anyLog.timestamp), reason))
                        } else {
                            // No log exists to attach reason to. 
                            console.warn(`Cannot save reason for ${dateStr} without a time entry.`)
                        }
                    }
                }
            }

            await Promise.all(promises)

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
        <div className="bg-[#141419] rounded-3xl border border-[#1f1f23] overflow-hidden">
            {/* Header Metadata Area */}
            <div className="p-6 border-b border-[#1f1f23] flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h3 className="text-xl font-bold text-white tracking-tight">DAILY TIME RECORD</h3>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-slate-500 text-xs uppercase tracking-widest">Period Start Date:</span>
                        {/* Date Picker */}
                        <input
                            type="date"
                            className="bg-[#1f1f23] text-white text-xs px-2 py-1 rounded border border-slate-700 focus:outline-none focus:border-[#8b5cf6]"
                            value={formatDateForInput(anchorDate)}
                            onChange={handleDateChange}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {editMode ? (
                        <>
                            <button
                                onClick={handleSmartFill}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#f6e05e]/10 text-[#f6e05e] hover:bg-[#f6e05e]/20 text-sm font-bold transition-colors mr-2 border border-[#f6e05e]/20"
                                title="Auto-fill Mon-Fri (9am-6pm)"
                            >
                                <Zap size={16} />
                                <span className="hidden sm:inline">Smart Fill</span>
                            </button>
                            <button
                                onClick={handleClearRecords}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 text-sm font-bold transition-colors mr-2 border border-red-500/20"
                                title="Clear all records in view"
                            >
                                <Trash2 size={16} />
                                <span className="hidden sm:inline">Clear</span>
                            </button>
                            <button
                                onClick={handleCancel}
                                disabled={saving}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm font-bold transition-colors"
                            >
                                <X size={16} />
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#22c55e] text-black hover:bg-[#22c55e]/90 text-sm font-bold transition-colors shadow-lg shadow-green-900/20"
                            >
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Save Changes
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => setEditMode(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#8b5cf6]/10 text-[#8b5cf6] hover:bg-[#8b5cf6]/20 border border-[#8b5cf6]/50 text-sm font-bold transition-colors"
                        >
                            <Pencil size={16} />
                            Edit Records
                        </button>
                    )}
                </div>
            </div>

            {/* The Grid */}
            <div className="overflow-x-auto">
                <table className="w-full text-center border-collapse">
                    <thead>
                        {/* Top Level Headers */}
                        <tr className="border-b border-[#1f1f23]">
                            <th className="p-3 bg-[#1a1a20] text-slate-400 font-medium text-xs w-32 border-r border-[#1f1f23]">DAY</th>
                            <th className="p-3 bg-[#1a1a20] text-slate-400 font-medium text-xs w-32 border-r border-[#1f1f23]">DATE</th>

                            <th colSpan={2} className="p-2 border-r border-[#1f1f23] bg-[#22c55e]/5">
                                <div className="text-[#22c55e] font-bold text-xs uppercase tracking-wider">Regular Time</div>
                            </th>

                            <th colSpan={2} className="p-2 border-r border-[#1f1f23] bg-[#8b5cf6]/5">
                                <div className="text-[#8b5cf6] font-bold text-xs uppercase tracking-wider">Overtime</div>
                            </th>
                            <th className="p-3 bg-[#1a1a20] text-slate-400 font-medium text-xs border-r border-[#1f1f23]">REASON / NOTES</th>
                        </tr>

                        <tr className="border-b border-[#1f1f23] text-xs font-semibold">
                            <th className="bg-[#141419] border-r border-[#1f1f23]"></th>
                            <th className="bg-[#141419] border-r border-[#1f1f23]"></th>

                            <th className="py-2 text-[#22c55e] bg-[#22c55e]/5 border-r border-[#1f1f23] border-dashed border-white/10 w-32">IN</th>
                            <th className="py-2 text-[#22c55e] bg-[#22c55e]/5 border-r border-[#1f1f23] w-32">OUT</th>

                            <th className="py-2 text-[#8b5cf6] bg-[#8b5cf6]/5 border-r border-[#1f1f23] border-dashed border-white/10 w-32">IN</th>
                            <th className="py-2 text-[#8b5cf6] bg-[#8b5cf6]/5 border-r border-[#1f1f23] w-32">OUT</th>
                            <th className="bg-[#141419]"></th>
                        </tr>
                    </thead>
                    <tbody className="text-sm">
                        {rows.map((date, i) => (
                            <tr key={i} className="border-b border-[#1f1f23] group hover:bg-white/5 transition-colors">
                                {/* Day */}
                                <td className="py-4 text-white border-r border-[#1f1f23] font-bold text-left px-4 text-base">
                                    {date.toLocaleDateString('en-GB', { weekday: 'long' })}
                                </td>
                                {/* Date */}
                                <td className="py-4 text-white border-r border-[#1f1f23] font-mono text-center text-base">
                                    {date.toLocaleDateString('en-GB')}
                                </td>

                                {/* Regular IN */}
                                <td className="p-0 border-r border-[#1f1f23] border-dashed border-white/10 bg-[#22c55e]/5 font-mono h-12">
                                    {editMode ? (
                                        <input
                                            type="time"
                                            className="w-full h-full bg-black/50 text-white text-center focus:outline-none focus:bg-black focus:ring-1 ring-[#22c55e]"
                                            value={getInputValue(date, 'IN')}
                                            onChange={(e) => handleEditChange(date, 'IN', e.target.value)}
                                        />
                                    ) : (
                                        <div className="py-3 text-white">{getDisplayValue(date, 'IN') || '-'}</div>
                                    )}
                                </td>

                                {/* Regular OUT */}
                                <td className="p-0 border-r border-[#1f1f23] bg-[#22c55e]/5 font-mono">
                                    {editMode ? (
                                        <input
                                            type="time"
                                            className="w-full h-full bg-black/50 text-white text-center focus:outline-none focus:bg-black focus:ring-1 ring-[#22c55e]"
                                            value={getInputValue(date, 'OUT')}
                                            onChange={(e) => handleEditChange(date, 'OUT', e.target.value)}
                                        />
                                    ) : (
                                        <div className="py-3 text-white">{getDisplayValue(date, 'OUT') || '-'}</div>
                                    )}
                                </td>

                                {/* Overtime IN */}
                                <td className="p-0 border-r border-[#1f1f23] border-dashed border-white/10 bg-[#8b5cf6]/5 font-mono">
                                    {editMode ? (
                                        <input
                                            type="time"
                                            className="w-full h-full bg-black/50 text-white text-center focus:outline-none focus:bg-black focus:ring-1 ring-[#8b5cf6]"
                                            value={getInputValue(date, 'OT_IN')}
                                            onChange={(e) => handleEditChange(date, 'OT_IN', e.target.value)}
                                        />
                                    ) : (
                                        <div className="py-3 text-white">{getDisplayValue(date, 'OT_IN') || '-'}</div>
                                    )}
                                </td>

                                {/* Overtime OUT */}
                                <td className="p-0 border-r border-[#1f1f23] bg-[#8b5cf6]/5 font-mono">
                                    {editMode ? (
                                        <input
                                            type="time"
                                            className="w-full h-full bg-black/50 text-white text-center focus:outline-none focus:bg-black focus:ring-1 ring-[#8b5cf6]"
                                            value={getInputValue(date, 'OT_OUT')}
                                            onChange={(e) => handleEditChange(date, 'OT_OUT', e.target.value)}
                                        />
                                    ) : (
                                        <div className="py-3 text-white">{getDisplayValue(date, 'OT_OUT') || '-'}</div>
                                    )}
                                </td>

                                {/* Reason / Notes */}
                                <td className="p-0 border-r border-[#1f1f23] text-slate-400 font-mono">
                                    {editMode ? (
                                        <input
                                            type="text"
                                            placeholder="..."
                                            className="w-full h-full bg-black/50 text-white px-2 py-1 text-xs focus:outline-none focus:bg-black focus:ring-1 ring-slate-500"
                                            value={getInputValue(date, 'REASON')}
                                            onChange={(e) => handleEditChange(date, 'REASON', e.target.value)}
                                        />
                                    ) : (
                                        <div className="py-3 px-2 text-xs truncate max-w-[150px]" title={getDisplayValue(date, 'REASON')}>{getDisplayValue(date, 'REASON') || ''}</div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
