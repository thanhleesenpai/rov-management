import React, { forwardRef } from 'react'
import { Calendar } from 'lucide-react'

export const MarineDatePicker = forwardRef(({ className = '', includeTime = false, ...props }, ref) => {
  return (
    <div className={`relative flex items-center ${className}`}>
      <input
        type={includeTime ? 'datetime-local' : 'date'}
        ref={ref}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => { 
          try { 
            e.target.showPicker() 
          } catch(err) {} 
        }}
        className="
          w-full h-[38px] pl-3 pr-8 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-sm
          text-xs font-mono tracking-widest text-slate-700 dark:text-slate-300
          hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50/50 dark:hover:bg-slate-800/50
          focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:focus:border-cyan-400 dark:focus:ring-cyan-400/10
          transition-all duration-200 dark:[color-scheme:dark] cursor-pointer select-none
          [&::-webkit-calendar-picker-indicator]:hidden
          [&::-webkit-datetime-edit]:py-0 [&::-webkit-datetime-edit-fields-wrapper]:p-0
        "
        {...props}
      />
      <Calendar className="absolute right-3 w-4 h-4 text-slate-400 pointer-events-none" />
    </div>
  )
})

MarineDatePicker.displayName = 'MarineDatePicker'
