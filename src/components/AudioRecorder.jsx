import { useEffect, useRef, useState } from 'react'
import { IconStop, IconTrash, IconPlay, IconPause, IconMic } from './Icons.jsx'

function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  for (const type of candidates) {
    if (window.MediaRecorder?.isTypeSupported?.(type)) return type
  }
  return ''
}

function formatTime(sec) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Full-screen voice memo recorder. Records via MediaRecorder, lets the
// person preview and re-record before committing, and hands back a Blob on
// save — the caller uploads it the same way it uploads any other file.
export default function AudioRecorder({ onCancel, onSave }) {
  const [status, setStatus] = useState('idle') // idle | recording | recorded | denied
  const [seconds, setSeconds] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [saving, setSaving] = useState(false)
  const mediaRecorder = useRef(null)
  const chunks = useRef([])
  const streamRef = useRef(null)
  const timerRef = useRef(null)
  const audioRef = useRef(null)
  const [blob, setBlob] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  useEffect(() => {
    startRecording()
    return () => {
      clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = pickMimeType()
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunks.current = []
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data) }
      rec.onstop = () => {
        const b = new Blob(chunks.current, { type: mimeType || 'audio/webm' })
        setBlob(b)
        setPreviewUrl(URL.createObjectURL(b))
        setStatus('recorded')
      }
      mediaRecorder.current = rec
      rec.start()
      setStatus('recording')
      setSeconds(0)
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch (err) {
      console.error('mic permission failed:', err)
      setStatus('denied')
    }
  }

  function stopRecording() {
    clearInterval(timerRef.current)
    mediaRecorder.current?.stop()
    streamRef.current?.getTracks().forEach((t) => t.stop())
  }

  function reRecord() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setBlob(null)
    setPreviewUrl(null)
    setPlaying(false)
    startRecording()
  }

  function togglePlay() {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
    } else {
      el.play()
    }
  }

  function handleSave() {
    if (!blob) return
    setSaving(true)
    onSave(blob)
  }

  return (
    <div className="editor-backdrop" onClick={onCancel}>
      <div className="editor-card audio-card" onClick={(e) => e.stopPropagation()}>
        <div className="drawing-header">
          <span>Voice memo</span>
        </div>

        <div className="audio-recorder-body">
          {status === 'denied' && (
            <p className="drive-error" style={{ padding: 20, textAlign: 'center' }}>
              Couldn't access the microphone. Check your browser or device permissions and try again.
            </p>
          )}

          {status === 'recording' && (
            <>
              <div className="audio-pulse">
                <IconMic width="32" height="32" />
              </div>
              <div className="audio-timer">{formatTime(seconds)}</div>
              <p className="audio-hint">Recording…</p>
            </>
          )}

          {status === 'recorded' && (
            <>
              <button className="audio-play-btn" onClick={togglePlay}>
                {playing ? <IconPause width="26" height="26" /> : <IconPlay width="26" height="26" />}
              </button>
              <div className="audio-timer">{formatTime(seconds)}</div>
              <p className="audio-hint">Tap to preview your recording</p>
              <audio
                ref={audioRef}
                src={previewUrl}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                hidden
              />
            </>
          )}
        </div>

        <div className="editor-controls">
          <div className="editor-row" style={{ justifyContent: 'center' }}>
            {status === 'recording' && (
              <button className="drive-connect-btn" onClick={stopRecording}>
                <IconStop width="16" height="16" /> Stop
              </button>
            )}
            {status === 'recorded' && (
              <>
                <button className="pill-btn" onClick={reRecord}>
                  <IconTrash width="16" height="16" /> Re-record
                </button>
                <button className="drive-connect-btn" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            )}
          </div>
          <div className="editor-row" style={{ marginTop: 4 }}>
            <button className="text-btn" onClick={onCancel} style={{ margin: '0 auto' }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}
