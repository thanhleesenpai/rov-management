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
          w-full h-[38px] pl-3 pr-8 py-2 bg-background border border-input rounded-md shadow-sm
          text-xs font-mono tracking-widest text-foreground
          hover:border-ring/50 hover:bg-muted/20
          focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/30
          transition-all duration-200 dark:[color-scheme:dark] cursor-pointer select-none
          [&::-webkit-calendar-picker-indicator]:hidden
          [&::-webkit-datetime-edit]:py-0 [&::-webkit-datetime-edit-fields-wrapper]:p-0
        "
        {...props}
      />
      <Calendar className="absolute right-3 w-4 h-4 text-muted-foreground pointer-events-none" />
    </div>
  )
})

MarineDatePicker.displayName = 'MarineDatePicker'
