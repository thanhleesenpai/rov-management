import React, { forwardRef } from 'react'

export const MarineInput = forwardRef(({ className = '', ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={`
        w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-sm px-3 py-2
        font-sans text-sm font-medium text-slate-700 dark:text-slate-300
        hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50/50 dark:hover:bg-slate-800/50
        focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:focus:border-cyan-400 dark:focus:ring-cyan-400/10
        disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:cursor-not-allowed disabled:shadow-none
        dark:disabled:bg-slate-800/50 dark:disabled:text-slate-500 dark:disabled:border-slate-700/50
        placeholder:text-muted-foreground/50 transition-all duration-200
        ${className}
      `}
      {...props}
    />
  )
})

MarineInput.displayName = 'MarineInput'
