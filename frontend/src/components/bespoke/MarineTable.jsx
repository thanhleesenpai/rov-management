import React from 'react'

export function MarineTable({ children, className = '' }) {
  return (
    <div className={`w-full overflow-x-auto bg-card text-card-foreground border border-border rounded-lg shadow-sm ${className}`}>
      <table className="w-full text-left border-collapse">
        {children}
      </table>
    </div>
  )
}

export function MarineTableHeader({ children }) {
  return <thead>{children}</thead>
}

export function MarineTableBody({ children }) {
  return <tbody>{children}</tbody>
}

export function MarineTableRow({ children, className = '', onClick }) {
  const pointerClass = onClick ? 'cursor-pointer' : ''
  return (
    <tr
      onClick={onClick}
      className={`group border-b border-border/50 hover:bg-muted/50 transition-colors ${pointerClass} ${className}`}
    >
      {children}
    </tr>
  )
}

export function MarineTableHead({ children, className = '', align = 'left' }) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return (
    <th className={`px-4 py-3 pb-2 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold border-b border-border/50 bg-muted/50 ${alignClass} ${className}`}>
      {children}
    </th>
  )
}

export function MarineTableCell({ children, className = '', align = 'left', isMono = false }) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  const fontClass = isMono ? 'font-mono text-sm text-foreground' : 'font-sans text-sm font-medium text-foreground'
  return (
    <td className={`px-4 py-3 align-middle ${alignClass} ${fontClass} ${className}`}>
      {children}
    </td>
  )
}

export function MarineTableStatus({ status, label }) {
  let dotColor = 'bg-slate-400 shadow-[0_0_4px_rgba(148,163,184,0.6)]' // Default: Pending/Unknown

  if (status === 'done' || status === 'success' || status === 'completed') {
    dotColor = 'bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)] dark:bg-emerald-400 dark:shadow-[0_0_4px_rgba(52,211,153,0.6)]'
  } else if (status === 'failed' || status === 'error' || status === 'cancelled') {
    dotColor = 'bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.6)] dark:bg-red-400 dark:shadow-[0_0_4px_rgba(248,113,113,0.6)]'
  } else if (status === 'pending' || status === 'warning' || status === 'planned' || status === 'maintenance') {
    dotColor = 'bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.6)] dark:bg-amber-400 dark:shadow-[0_0_4px_rgba(251,191,36,0.6)]'
  }

  if (status === 'running' || status === 'active' || status === 'ongoing') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500 shadow-[0_0_4px_rgba(6,182,212,0.6)]"></span>
        </span>
        <span className="font-sans text-[10px] uppercase tracking-widest font-semibold text-foreground">{label}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`}></span>
      <span className="font-sans text-[10px] uppercase tracking-widest font-semibold text-foreground">{label}</span>
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'

export function MarineTableActionMenu({ children }) {
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef(null)
  const dropdownRef = useRef(null)
  const [coords, setCoords] = useState({ top: 0, left: 0 })

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setIsOpen(false)
      }
    }

    const handleScroll = () => {
      if (isOpen) setIsOpen(false) // Close on scroll for simplicity
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      window.addEventListener('scroll', handleScroll, true) // capture phase to catch div scrolls
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [isOpen])

  const toggleMenu = (e) => {
    e.stopPropagation()
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      // Position to the left of the button, and slightly below the top of the button
      // Window.scrollY/X is needed because portal is absolute to the document body
      let top = rect.top + window.scrollY
      let left = rect.left + window.scrollX - 140 // dropdown width is approx 128px (w-32) + gap

      // Simple collision detection for bottom of screen
      if (rect.top + 100 > window.innerHeight) {
        top = rect.top + window.scrollY - 80 // open upwards
      }

      setCoords({ top, left })
    }
    setIsOpen(!isOpen)
  }

  return (
    <>
      <div className="relative flex items-center" ref={buttonRef}>
        <button
          type="button"
          aria-label="Actions"
          onClick={toggleMenu}
          className={`p-1 rounded transition-colors ${isOpen ? 'bg-muted text-primary' : 'text-muted-foreground hover:text-primary hover:bg-muted'}`}
        >
          <MoreVertical size={16} />
        </button>
      </div>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          onClick={(e) => e.stopPropagation()}
          style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
          className="absolute z-[9999] bg-card text-foreground border border-border shadow-2xl rounded-md w-32 py-1 animate-in fade-in zoom-in-95 duration-100"
        >
          <div onClick={() => setIsOpen(false)}>
            {children}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export function MarineTableActionItem({ children, onClick, isDanger = false }) {
  const hoverClass = isDanger
    ? 'hover:bg-destructive/10 hover:text-destructive'
    : 'hover:bg-muted hover:text-primary'

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        if (onClick) onClick(e)
      }}
      className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-foreground transition-colors ${hoverClass}`}
    >
      {children}
    </button>
  )
}
