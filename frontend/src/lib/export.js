import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── CSV ──────────────────────────────────────────────────────────────────
function toCSV(headers, rows) {
  const escape = (v) => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const lines = [headers.map(escape).join(',')]
  rows.forEach(row => lines.push(row.map(escape).join(',')))
  return lines.join('\n')
}

function downloadCSV(filename, csv) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── PDF ──────────────────────────────────────────────────────────────────
function downloadPDF(filename, title, headers, rows) {
  const doc = new jsPDF({ orientation: 'landscape' })

  doc.setFontSize(16)
  doc.setTextColor(30, 30, 30)
  doc.text(title, 14, 16)

  doc.setFontSize(9)
  doc.setTextColor(120, 120, 120)
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 23)

  autoTable(doc, {
    startY: 28,
    head: [headers],
    body: rows,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  })

  doc.save(filename)
}

// ─── Trips ────────────────────────────────────────────────────────────────
export function exportTripsCSV(trips) {
  const headers = ['Name', 'ROV', 'Location', 'Status', 'Start Time', 'End Time', 'Created By']
  const rows = trips.map(t => [
    t.name,
    t.rov?.name || '—',
    t.location || '—',
    t.status,
    t.startTime ? new Date(t.startTime).toLocaleString() : '—',
    t.endTime   ? new Date(t.endTime).toLocaleString()   : '—',
    t.createdBy?.fullName || '—',
  ])
  downloadCSV(`trips_${dateTag()}.csv`, toCSV(headers, rows))
}

export function exportTripsPDF(trips) {
  const headers = ['Name', 'ROV', 'Location', 'Status', 'Start Time', 'End Time']
  const rows = trips.map(t => [
    t.name,
    t.rov?.name || '—',
    t.location || '—',
    t.status,
    t.startTime ? new Date(t.startTime).toLocaleDateString() : '—',
    t.endTime   ? new Date(t.endTime).toLocaleDateString()   : '—',
  ])
  downloadPDF(`trips_${dateTag()}.pdf`, 'Trip Report', headers, rows)
}

// ─── Dives ────────────────────────────────────────────────────────────────
export function exportDivesCSV(dives) {
  const headers = ['Title', 'Description', 'Trip', 'Status', 'Created By', 'Created At']
  const rows = dives.map(d => [
    d.title,
    d.description || '—',
    d.trip?.name || '—',
    d.status,
    d.createdBy?.fullName || '—',
    new Date(d.createdAt).toLocaleString(),
  ])
  downloadCSV(`dives_${dateTag()}.csv`, toCSV(headers, rows))
}

export function exportDivesPDF(dives) {
  const headers = ['Title', 'Trip', 'Status', 'Created By', 'Created At']
  const rows = dives.map(d => [
    d.title,
    d.trip?.name || '—',
    d.status,
    d.createdBy?.fullName || '—',
    new Date(d.createdAt).toLocaleDateString(),
  ])
  downloadPDF(`dives_${dateTag()}.pdf`, 'Dive Report', headers, rows)
}

// ─── ROVs ─────────────────────────────────────────────────────────────────
export function exportRovsCSV(rovs) {
  const headers = ['Name', 'Model', 'Serial Number', 'Status', 'Notes']
  const rows = rovs.map(r => [
    r.name, r.model, r.serialNumber, r.status, r.notes || '—'
  ])
  downloadCSV(`rovs_${dateTag()}.csv`, toCSV(headers, rows))
}

export function exportRovsPDF(rovs) {
  const headers = ['Name', 'Model', 'Serial Number', 'Status', 'Notes']
  const rows = rovs.map(r => [
    r.name, r.model, r.serialNumber, r.status, r.notes || '—'
  ])
  downloadPDF(`rovs_${dateTag()}.pdf`, 'ROV Registry', headers, rows)
}

// ─── Users ────────────────────────────────────────────────────────────────
export function exportUsersCSV(users) {
  const headers = ['Full Name', 'Email', 'Role', 'Status', 'Last Login']
  const rows = users.map(u => [
    u.fullName, u.email, u.role,
    u.isActive ? 'Active' : 'Disabled',
    u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—',
  ])
  downloadCSV(`users_${dateTag()}.csv`, toCSV(headers, rows))
}

export function exportUsersPDF(users) {
  const headers = ['Full Name', 'Email', 'Role', 'Status', 'Last Login']
  const rows = users.map(u => [
    u.fullName, u.email, u.role,
    u.isActive ? 'Active' : 'Disabled',
    u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '—',
  ])
  downloadPDF(`users_${dateTag()}.pdf`, 'User Report', headers, rows)
}

// ─── Helper ───────────────────────────────────────────────────────────────
function dateTag() {
  return new Date().toISOString().slice(0, 10)
}
