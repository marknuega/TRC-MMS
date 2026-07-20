import { useEffect, useState } from 'react'
import { listReports, createReport, deleteReport } from './api'
import './App.css'

const emptyForm = {
  reportDate: new Date().toISOString().slice(0, 10),
  author: '',
  summary: '',
  hoursWorked: '',
}

function App() {
  const [reports, setReports] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  async function refresh() {
    try {
      setReports(await listReports())
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      await createReport({
        ...form,
        hoursWorked: form.hoursWorked === '' ? null : Number(form.hoursWorked),
      })
      setForm({ ...emptyForm, author: form.author })
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(id) {
    try {
      await deleteReport(id)
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  return (
    <main className="app">
      <h1>TRC Daily Report</h1>

      {error && <p className="error">{error}</p>}

      <form onSubmit={handleSubmit} className="report-form">
        <label>
          Date
          <input type="date" value={form.reportDate} onChange={update('reportDate')} required />
        </label>
        <label>
          Author
          <input value={form.author} onChange={update('author')} required />
        </label>
        <label>
          Hours
          <input
            type="number"
            step="0.25"
            min="0"
            value={form.hoursWorked}
            onChange={update('hoursWorked')}
          />
        </label>
        <label className="full">
          Summary
          <textarea value={form.summary} onChange={update('summary')} rows={3} required />
        </label>
        <button type="submit">Add report</button>
      </form>

      {loading ? (
        <p>Loading…</p>
      ) : reports.length === 0 ? (
        <p className="empty">No reports yet.</p>
      ) : (
        <ul className="report-list">
          {reports.map((r) => (
            <li key={r.id}>
              <div>
                <strong>{new Date(r.reportDate).toLocaleDateString()}</strong> — {r.author}
                {r.hoursWorked != null && <span className="hours">{r.hoursWorked}h</span>}
                <p>{r.summary}</p>
              </div>
              <button onClick={() => handleDelete(r.id)} aria-label="Delete report">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default App
