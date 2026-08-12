import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { hasSupabaseConfig, supabase } from './lib/supabase'
import type { LectureRow, StudentRecord } from './types'

const SUBJECTS = [
  { label: 'AWS Cloud Security', table: 'aws_cloud_security', short: 'AWS' },
  { label: 'Data Science and Analytics', table: 'data_science_and_analytics', short: 'DSA' },
  { label: 'Operation Research', table: 'operation_research', short: 'OR' },
  { label: 'Digital SCM', table: 'digital_scm', short: 'SCM' },
  { label: 'IPR and Research Methodology', table: 'ipr_and_research_methodology', short: 'IPR' },
] as const
const SLOTS = ['08:00 AM - 09:00 AM', '09:00 AM - 10:00 AM', '10:00 AM - 11:00 AM', '11:00 AM - 12:00 PM', '12:00 PM - 01:00 PM', '01:00 PM - 02:00 PM', '02:00 PM - 03:00 PM', '03:00 PM - 04:00 PM']
const FILTER_KEY = 'viit-attendance-viewer-filters'

function parseStudents(value: unknown): StudentRecord[] {
  if (Array.isArray(value)) return value as StudentRecord[]
  if (typeof value === 'string') { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [] } catch { return [] } }
  return []
}
function details(student: StudentRecord) {
  const raw = student.user?.trim() || ''
  const match = raw.match(/^(\d+)[_\s]+(.*)$/)
  const storedRoll = String(student.displayRoll || student.roll || match?.[1] || '').trim()
  const roll = !storedRoll || storedRoll === '9999' ? 'not_available' : storedRoll
  return { roll, name: String(student.name || match?.[2] || raw || 'Unknown participant'), raw }
}
function searchText(student: StudentRecord) { const item = details(student); return `${item.roll} ${item.name} ${item.raw}`.toLowerCase() }
function csvValue(value: string | number) { return `"${String(value).replace(/"/g, '""')}"` }
function downloadCsv(lecture: LectureRow, subject: string) {
  const rows = [['Subject', subject], ['Date', lecture.attendance_date], ['Time Slot', lecture.time_slot], [], ['Sr. No.', 'Roll Number', 'Name', 'Meet Display Name'], ...(lecture.students || []).map((student, index) => { const item = details(student); return [index + 1, item.roll, item.name, item.raw || item.name] })]
  const csv = `\uFEFF${rows.map((row) => row.map(csvValue).join(',')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = `Attendance_${lecture.attendance_date}_${lecture.time_slot.replace(/[^a-z0-9]+/gi, '-')}.csv`; link.click(); URL.revokeObjectURL(url)
}

function App() {
  const saved = useMemo(() => { try { return JSON.parse(localStorage.getItem(FILTER_KEY) || '{}') as Record<string, string> } catch { return {} } }, [])
  const [subject, setSubject] = useState(saved.subject && SUBJECTS.some((item) => item.table === saved.subject) ? saved.subject : SUBJECTS[0].table)
  const [date, setDate] = useState(saved.date || '')
  const [timeSlot, setTimeSlot] = useState(saved.timeSlot || '')
  const [search, setSearch] = useState(saved.search || '')
  const [lectures, setLectures] = useState<LectureRow[]>([])
  const [selectedLecture, setSelectedLecture] = useState<LectureRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const selectedSubject = SUBJECTS.find((item) => item.table === subject) || SUBJECTS[0]

  const loadLectures = useCallback(async () => {
    if (!supabase) return
    setLoading(true); setError('')
    let query = supabase.from(subject).select('attendance_date,time_slot,students,synced_at').order('attendance_date', { ascending: false }).order('time_slot', { ascending: true })
    if (date) query = query.eq('attendance_date', date)
    if (timeSlot) query = query.eq('time_slot', timeSlot)
    const result = await query
    if (result.error) setError(result.error.message); else setLectures((result.data || []).map((row) => ({ ...row, students: parseStudents(row.students) })))
    setLoading(false)
  }, [date, subject, timeSlot])
  useEffect(() => { const id = window.setTimeout(() => void loadLectures(), 0); return () => window.clearTimeout(id) }, [loadLectures])
  useEffect(() => { localStorage.setItem(FILTER_KEY, JSON.stringify({ subject, date, timeSlot, search })) }, [subject, date, timeSlot, search])
  const visible = useMemo(() => { const needle = search.trim().toLowerCase(); return needle ? lectures.filter((lecture) => lecture.students?.some((student) => searchText(student).includes(needle))) : lectures }, [lectures, search])
  const present = visible.reduce((sum, lecture) => sum + (lecture.students?.length || 0), 0)

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark">VA</div><div><p className="eyebrow">VIIT ACADEMICS</p><h1>Attendance desk</h1></div></div><div className="connection"><span className={hasSupabaseConfig ? 'status-dot live' : 'status-dot'} />{hasSupabaseConfig ? 'Connected to Supabase' : 'Configuration needed'}</div></header>
    <main className="workspace">
      <section className="intro"><div><p className="eyebrow">LECTURE RECORDS</p><h2>Browse attendance by subject and lecture</h2><p>Review synchronized participants from one place.</p></div><div className="stat-strip"><div><strong>{visible.length}</strong><span>Lectures</span></div><div><strong>{present}</strong><span>Present records</span></div></div></section>
      {!hasSupabaseConfig && <div className="notice error-notice"><strong>Supabase is not configured.</strong> Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>.</div>}
      {error && <div className="notice error-notice">{error}</div>}
      <section className="filter-bar"><label>Subject<select value={subject} onChange={(event) => { setSubject(event.target.value); setSelectedLecture(null) }}>{SUBJECTS.map((item) => <option key={item.table} value={item.table}>{item.label}</option>)}</select></label><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Time slot<select value={timeSlot} onChange={(event) => setTimeSlot(event.target.value)}><option value="">All time slots</option>{SLOTS.map((slot) => <option key={slot}>{slot}</option>)}</select></label><label className="search-field">Search participant<input type="search" placeholder="Roll number or name" value={search} onChange={(event) => setSearch(event.target.value)} /></label><button className="refresh-button" onClick={() => void loadLectures()} disabled={loading}>{loading ? 'Loading...' : 'Refresh records'}</button></section>
      <section className="records-section"><div className="section-heading"><div><p className="eyebrow">{selectedSubject.short}</p><h3>{selectedSubject.label}</h3></div><span>{visible.length} matching lecture{visible.length === 1 ? '' : 's'}</span></div>{loading ? <div className="empty-state">Loading attendance records...</div> : visible.length === 0 ? <div className="empty-state"><strong>No attendance found</strong><span>Try another filter or participant search.</span></div> : <div className="lecture-list">{visible.map((lecture) => { const students = lecture.students || []; const isOpen = selectedLecture?.attendance_date === lecture.attendance_date && selectedLecture?.time_slot === lecture.time_slot; return <article className={`lecture-record${isOpen ? ' expanded' : ''}`} key={`${lecture.attendance_date}-${lecture.time_slot}`}><div className="lecture-row"><div className="lecture-date"><strong>{new Date(`${lecture.attendance_date}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</strong><span>{new Date(`${lecture.attendance_date}T00:00:00`).getFullYear()}</span></div><div className="lecture-main"><div><h4>{lecture.time_slot}</h4><p>Last synced {new Date(lecture.synced_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p></div><div className="lecture-count"><strong>{students.length}</strong><span>present</span></div><button className="view-button" onClick={() => setSelectedLecture(isOpen ? null : lecture)}>{isOpen ? 'Hide list' : 'View list'}</button></div></div>{isOpen && <div className="attendance-detail"><div className="detail-toolbar"><div><p className="eyebrow">ATTENDANCE LIST</p><h4>{students.length} participants</h4></div><button className="download-button" onClick={() => downloadCsv(lecture, selectedSubject.label)}>Download CSV</button></div><div className="attendance-table-wrap"><table className="attendance-table"><thead><tr><th>Sr. No.</th><th>Roll number</th><th>Name</th><th>Meet display name</th></tr></thead><tbody>{students.map((student, index) => { const item = details(student); return <tr key={`${item.raw}-${index}`}><td>{index + 1}</td><td className="roll-cell">{item.roll || 'Not found'}</td><td>{item.name}</td><td className="muted-cell">{item.raw || item.name}</td></tr> })}</tbody></table></div></div>}</article> })}</div>}</section>
    </main>
  </div>
}

export default App
