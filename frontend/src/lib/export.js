import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

// ─── CSV ──────────────────────────────────────────────────────────────────
function toCSV(headers, rows) {
  const escape = (v) => {
    let s = v == null ? '' : String(v)
    // Prevent CSV formula injection: a leading =, +, -, @ (or tab/CR) makes
    // Excel/Sheets interpret the cell as a formula when opened. Prefixing with
    // a single quote forces it to be read as plain text instead.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const lines = [headers.map(escape).join(',')]
  rows.forEach(row => lines.push(row.map(escape).join(',')))
  return lines.join('\n')
}

function downloadCSV(filename, csv) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── PDF ──────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s ?? '—')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function downloadPDF(filename, title, headers, rows) {
  // Build a styled HTML table at 1060px wide (landscape A4 content width ~≈ at 96dpi)
  const el = document.createElement('div')
  Object.assign(el.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '1060px',
    background: '#ffffff',
    padding: '32px',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Arial, sans-serif',
    fontSize: '13px',
    color: '#111827',
  })

  const thStyle = [
    'background:#2563eb', 'color:#fff', 'padding:7px 12px',
    'text-align:left', 'font-weight:600', 'white-space:nowrap',
    'font-size:12px',
  ].join(';')

  const headerCells = headers.map(h => `<th style="${thStyle}">${escHtml(h)}</th>`).join('')
  const bodyRows = rows.map((row, i) => {
    const bg = i % 2 === 0 ? '#f9fafb' : '#ffffff'
    const cells = row.map(cell =>
      `<td style="padding:5px 12px;border-bottom:1px solid #e5e7eb;font-size:12px">${escHtml(String(cell ?? '—'))}</td>`
    ).join('')
    return `<tr style="background:${bg}">${cells}</tr>`
  }).join('')

  el.innerHTML = `
    <div style="margin-bottom:16px">
      <div style="font-size:17px;font-weight:700;color:#111827;margin-bottom:4px">${escHtml(title)}</div>
      <div style="font-size:11px;color:#6b7280">Generated: ${new Date().toLocaleString()}</div>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `

  el.style.opacity = '0'           // invisible to user
  el.style.pointerEvents = 'none'
  document.body.appendChild(el)

  // Two rAF ticks so the browser computes layout (offsetWidth/Height)
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))

  try {
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      width: el.offsetWidth,
      height: el.offsetHeight,
      windowWidth: el.offsetWidth,
      windowHeight: el.offsetHeight,
      // Restore opacity in html2canvas's internal clone so text renders fully
      onclone: (_, clonedEl) => { clonedEl.style.opacity = '1' },
    })

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const PAGE_W = doc.internal.pageSize.getWidth()   // 297mm
    const PAGE_H = doc.internal.pageSize.getHeight()  // 210mm
    const MARGIN = 8  // mm

    const contentW = PAGE_W - MARGIN * 2
    // How many canvas pixels fit in one page height (accounting for margins)
    const pxPerMm = canvas.width / contentW
    const pageHeightPx = (PAGE_H - MARGIN * 2) * pxPerMm

    let srcY = 0
    while (srcY < canvas.height) {
      if (srcY > 0) doc.addPage()

      const sliceH = Math.min(pageHeightPx, canvas.height - srcY)
      const slice = document.createElement('canvas')
      slice.width  = canvas.width
      slice.height = Math.ceil(sliceH)
      slice.getContext('2d').drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH)

      const imgH = (sliceH / pxPerMm)  // mm
      doc.addImage(slice.toDataURL('image/png'), 'PNG', MARGIN, MARGIN, contentW, imgH)
      srcY += sliceH
    }

    doc.save(filename)
  } finally {
    document.body.removeChild(el)
  }
}

// ─── Projects ────────────────────────────────────────────────────────────────
export function exportProjectsCSV(projects) {
  const headers = ['Name', 'ROV', 'Location', 'Status', 'Start Time', 'End Time', 'Created By']
  const rows = projects.map(t => [
    t.name,
    t.rov?.name || '—',
    t.locationName || t.location || '—',
    t.status,
    t.startTime ? new Date(t.startTime).toLocaleString() : '—',
    t.endTime   ? new Date(t.endTime).toLocaleString()   : '—',
    t.createdBy?.fullName || '—',
  ])
  downloadCSV(`projects_${dateTag()}.csv`, toCSV(headers, rows))
}

export function exportProjectsPDF(projects) {
  const headers = ['Name', 'ROV', 'Location', 'Status', 'Start Time', 'End Time']
  const rows = projects.map(t => [
    t.name,
    t.rov?.name || '—',
    t.locationName || t.location || '—',
    t.status,
    t.startTime ? new Date(t.startTime).toLocaleDateString() : '—',
    t.endTime   ? new Date(t.endTime).toLocaleDateString()   : '—',
  ])
  return downloadPDF(`projects_${dateTag()}.pdf`, 'Project Report', headers, rows)
}

// ─── Trips ────────────────────────────────────────────────────────────────
export function exportTripsCSV(trips) {
  const headers = ['Title', 'Description', 'Project', 'Status', 'Created By', 'Created At']
  const rows = trips.map(d => [
    d.title,
    d.description || '—',
    d.project?.name || '—',
    d.status,
    d.createdBy?.fullName || '—',
    new Date(d.createdAt).toLocaleString(),
  ])
  downloadCSV(`trips_${dateTag()}.csv`, toCSV(headers, rows))
}

export function exportTripsPDF(trips) {
  const headers = ['Title', 'Project', 'Status', 'Created By', 'Created At']
  const rows = trips.map(d => [
    d.title,
    d.project?.name || '—',
    d.status,
    d.createdBy?.fullName || '—',
    new Date(d.createdAt).toLocaleDateString(),
  ])
  return downloadPDF(`trips_${dateTag()}.pdf`, 'Trip Report', headers, rows)
}

// ─── ROVs ─────────────────────────────────────────────────────────────────
export function exportRovsCSV(rovs) {
  const headers = ['Name', 'Model', 'Serial Number', 'Status', 'Notes']
  const rows = rovs.map(r => [r.name, r.model, r.serialNumber, r.status, r.notes || '—'])
  downloadCSV(`rovs_${dateTag()}.csv`, toCSV(headers, rows))
}

export function exportRovsPDF(rovs) {
  const headers = ['Name', 'Model', 'Serial Number', 'Status', 'Notes']
  const rows = rovs.map(r => [r.name, r.model, r.serialNumber, r.status, r.notes || '—'])
  return downloadPDF(`rovs_${dateTag()}.pdf`, 'ROV Registry', headers, rows)
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
  return downloadPDF(`users_${dateTag()}.pdf`, 'User Report', headers, rows)
}

// ─── Helper ───────────────────────────────────────────────────────────────
function dateTag() {
  return new Date().toISOString().slice(0, 10)
}
