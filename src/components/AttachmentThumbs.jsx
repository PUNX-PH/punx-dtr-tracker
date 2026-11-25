import { useEffect, useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { attachmentApi } from '../services/api'
import { mimeOf } from '../services/attachments'

// Attachments already fetched this session, so flipping between employees doesn't re-read them.
const cache = new Map() // `${submissionId}/${fileId}` -> Promise<dataUrl>
const fetchOnce = (submissionId, meta) => {
    const key = `${submissionId}/${meta.id}`
    if (!cache.has(key)) {
        const p = attachmentApi.load(submissionId, meta)
        p.catch(() => cache.delete(key)) // a failure is retried next time, not remembered
        cache.set(key, p)
    }
    return cache.get(key)
}

/**
 * Every attachment of a submission, as [{ url, name, mime }] — the old ones that sit
 * inside the submission record (\`attachments\`, or a single \`attachmentUrl\`) and the
 * newer ones stored on their own (\`attachmentFiles\`, fetched here). \`url\` is null
 * while a stored one is still loading.
 */
export function useAttachments(sub) {
    const submissionId = sub ? (sub.id || `${sub.userId}_${sub.cutoffId}`) : ''
    const inline = sub ? (sub.attachments || (sub.attachmentUrl ? [sub.attachmentUrl] : [])) : []
    const files = sub?.attachmentFiles || []
    const filesKey = files.map(f => f.id).join(',')

    const [loaded, setLoaded] = useState({})
    const [error, setError] = useState('')

    useEffect(() => {
        let off = false
        setError('')
        files.forEach(meta => {
            fetchOnce(submissionId, meta)
                .then(url => { if (!off) setLoaded(prev => ({ ...prev, [meta.id]: url })) })
                .catch(e => { if (!off) setError(e.message || 'Could not load an attachment.') })
        })
        return () => { off = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [submissionId, filesKey])

    const items = [
        ...inline.map(url => ({ url, name: '', mime: mimeOf(url) })),
        ...files.map(meta => ({ url: loaded[meta.id] || null, name: meta.name, mime: meta.mime })),
    ]
    return { items, error, loading: !error && files.some(meta => !loaded[meta.id]) }
}

const ACCENT = {
    green: 'hover:border-[var(--accent-green)] hover:ring-[var(--accent-green)]/20',
    amber: 'hover:border-[var(--accent-amber)] hover:ring-[var(--accent-amber)]/20',
}

const extFor = (mime) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' }[mime] || 'png')

/** The thumbnails a reviewer clicks to download. Photos preview; other files show as a named file. */
export default function AttachmentThumbs({ sub, ownerName = 'employee', accent = 'green' }) {
    const { items, error, loading } = useAttachments(sub)
    if (items.length === 0) return null

    const download = (it, idx) => {
        if (!it.url) return
        const link = document.createElement('a')
        link.href = it.url
        link.download = it.name || `DTR_${ownerName}_${idx + 1}_${new Date().toISOString().split('T')[0]}.${extFor(it.mime)}`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    return (
        <>
            <div className="flex flex-wrap gap-2 justify-start lg:justify-end max-w-full lg:max-w-sm">
                {items.map((it, idx) => (
                    <button
                        key={idx}
                        type="button"
                        disabled={!it.url}
                        onClick={() => download(it, idx)}
                        className={`group relative block w-24 h-24 bg-[var(--surface-3)] rounded-lg border border-[var(--border-strong)] overflow-hidden hover:ring-2 transition-all cursor-pointer disabled:cursor-wait ${ACCENT[accent]}`}
                        title={it.name ? `Download ${it.name}` : `Click to Download Image ${idx + 1}`}
                    >
                        {!it.url ? (
                            <span className="absolute inset-0 flex items-center justify-center"><Loader2 size={18} className="animate-spin text-[var(--text-muted)]" /></span>
                        ) : /^image\//.test(it.mime) ? (
                            <img src={it.url} alt={`Attachment ${idx + 1}`} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                        ) : (
                            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center">
                                <FileText size={22} className="text-[var(--text-secondary)]" />
                                <span className="text-[9px] leading-tight text-[var(--text-secondary)] break-all line-clamp-2">{it.name || 'File'}</span>
                            </span>
                        )}
                        {it.url && (
                            <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-[9px] bg-black text-white px-1.5 py-0.5 rounded font-bold">Download</span>
                            </span>
                        )}
                        {items.length > 1 && (
                            <span className="absolute bottom-0 right-0 bg-black/50 text-white text-[9px] px-1">{idx + 1}</span>
                        )}
                    </button>
                ))}
            </div>
            {loading && <p className="text-[10px] text-[var(--text-muted)] mt-1">Loading attachments…</p>}
            {error && <p role="alert" className="text-[10px] text-[var(--accent-red)] mt-1">{error}</p>}
        </>
    )
}
