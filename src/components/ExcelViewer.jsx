import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { FileSpreadsheet, Upload, X } from 'lucide-react'

// Updated to optionally act as an inline component instead of just a fixed modal
export default function ExcelViewer({ isOpen, onClose }) {
    const [data, setData] = useState([])
    const [fileName, setFileName] = useState('')
    const fileInputRef = useRef(null)

    const handleFileUpload = (e) => {
        const file = e.target.files[0]
        if (!file) return

        setFileName(file.name)
        const reader = new FileReader()

        reader.onload = (event) => {
            try {
                const bstr = event.target.result
                const wb = XLSX.read(bstr, { type: 'binary', cellDates: true })
                const wsname = wb.SheetNames[0]
                const ws = wb.Sheets[wsname]
                const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
                setData(data)
            } catch (error) {
                console.error("Error parsing excel", error)
                alert("Error parsing Excel file")
            }
        }

        reader.readAsBinaryString(file)
    }

    const getCellStyle = (rowIndex, colIndex, value) => {
        const sValue = String(value || '').trim().toUpperCase()
        if (sValue === 'DAILY TIME RECORD') return 'bg-black text-white font-bold text-center text-lg py-2 border-2 border-black'

        if (rowIndex >= 1 && rowIndex <= 5) {
            if (colIndex === 0) return 'font-bold border-2 border-black bg-white text-left pl-2'
            return 'font-bold border-2 border-black bg-white text-center'
        }

        if (sValue === 'REGULAR TIME') return 'bg-[#9bbb59] text-white font-bold text-center border-2 border-black'
        if (sValue === 'OVERTIME') return 'bg-[#4f81bd] text-white font-bold text-center border-2 border-black'

        if (rowIndex === 7 || sValue === 'DAY' || sValue === 'DATE' || (rowIndex === 7 && sValue === 'TIME IN')) {
            if (colIndex < 2) return 'bg-black text-white font-bold text-center border-2 border-black'
            if (colIndex >= 2 && colIndex <= 3) return 'bg-[#9bbb59] text-black font-bold text-center border-2 border-black border-dashed'
            if (colIndex >= 4 && colIndex <= 5) return 'bg-[#4f81bd] text-black font-bold text-center border-2 border-black border-dashed'
            if (colIndex === 6) return 'bg-[#808080] text-black font-bold text-center border-2 border-black'
        }

        if (rowIndex > 7) {
            const baseStyle = 'text-center text-sm font-medium border-r border-black border-dashed border-b text-black'
            if (colIndex < 2) return `${baseStyle} bg-white border-2 border-black`
            if (colIndex === 2 || colIndex === 3) return `${baseStyle} bg-[#ebf1de]`
            if (colIndex === 4 || colIndex === 5) return `${baseStyle} bg-[#dce6f1]`
            if (colIndex === 6) return `${baseStyle} bg-[#d9d9d9] border-r-2 border-r-black`
        }
        return 'bg-white border border-slate-300 text-center text-black'
    }

    if (!isOpen) return null

    return (
        <div className="h-full flex flex-col bg-white dark:bg-[#141419]">
            {/* Header */}
            <div className="p-6 border-b border-[#1f1f23] flex justify-between items-center bg-slate-50 dark:bg-[#1a1a20]">
                <div>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <FileSpreadsheet className="text-[#22c55e]" />
                        Excel Viewer
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        {fileName ? fileName : 'Upload DTR .xlsx file to view'}
                    </p>
                </div>
                {/* <button onClick={onClose} ... /> - Removed close button as it's now a tab */}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6 bg-slate-100 dark:bg-[#0f0f12]">
                {data.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4 border-2 border-dashed border-[#1f1f23] rounded-3xl m-4 bg-[#141419]">
                        <Upload size={48} className="opacity-20" />
                        <p>No file selected</p>
                        <button
                            onClick={() => fileInputRef.current.click()}
                            className="bg-[#22c55e] hover:bg-[#22c55e]/90 text-black font-bold px-8 py-3 rounded-xl transition-all shadow-lg shadow-green-500/20"
                        >
                            Choose Excel File
                        </button>
                    </div>
                ) : (
                    <div className="relative overflow-x-auto shadow-xl bg-white mx-auto w-fit p-4 rounded-lg">
                        <table className="border-collapse border-2 border-black min-w-[800px]">
                            <tbody>
                                {data.map((row, rowIndex) => (
                                    <tr key={rowIndex}>
                                        {row.map((val, colIndex) => {
                                            if (rowIndex === 0 && colIndex > 0) return null;
                                            return (
                                                <td
                                                    key={colIndex}
                                                    colSpan={rowIndex === 0 ? 10 : 1}
                                                    className={`p-1 px-2 ${getCellStyle(rowIndex, colIndex, val)}`}
                                                >
                                                    {val}
                                                </td>
                                            )
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={handleFileUpload}
                    ref={fileInputRef}
                    className="hidden"
                />
            </div>

            {/* Footer */}
            {data.length > 0 && (
                <div className="p-4 border-t border-[#1f1f23] bg-[#1a1a20] flex justify-end gap-3">
                    <button
                        onClick={() => { setData([]); setFileName(''); }}
                        className="text-sm text-red-500 hover:text-red-400 font-medium px-4 py-2"
                    >
                        Clear Data
                    </button>
                    <button
                        onClick={() => fileInputRef.current.click()}
                        className="px-6 py-2 bg-[#22c55e] hover:bg-[#22c55e]/90 rounded-lg text-sm font-bold text-black transition-colors"
                    >
                        Upload New
                    </button>
                </div>
            )}
        </div>
    )
}
