import React from 'react'

export function SectionLabel({ children }) {
  return (
    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
      {children}
    </p>
  )
}
