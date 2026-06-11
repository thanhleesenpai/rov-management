import React, { forwardRef } from 'react'

export const MarineTextarea = forwardRef(({ className = '', ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={`
        w-full bg-background border border-input rounded-md shadow-sm px-3 py-2
        font-sans text-sm font-medium text-foreground
        hover:border-ring/50 hover:bg-muted/20
        focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/30
        disabled:bg-muted disabled:text-muted-foreground disabled:border-input disabled:cursor-not-allowed disabled:shadow-none
        placeholder:text-muted-foreground/50 transition-all duration-200 resize-none
        ${className}
      `}
      {...props}
    />
  )
})

MarineTextarea.displayName = 'MarineTextarea'
