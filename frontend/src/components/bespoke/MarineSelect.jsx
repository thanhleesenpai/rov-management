import React, { forwardRef, useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

export const MarineSelect = forwardRef(({ className = '', children, value, onChange, ...props }, ref) => {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)

  // Parse <option> elements into an array of objects
  const options = React.Children.toArray(children).map(child => ({
    value: child.props.value,
    label: child.props.children,
  }))

  const selectedOption = options.find(opt => opt.value === value)
  const displayLabel = selectedOption ? selectedOption.label : ''

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (optionValue) => {
    if (onChange) {
      onChange({ target: { value: optionValue } })
    }
    setIsOpen(false)
  }

  return (
    <div className={`relative w-full ${className}`} ref={containerRef}>
      <button
        ref={ref}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full flex items-center justify-between
          bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-sm px-3 py-2
          font-sans text-sm font-medium text-slate-700 dark:text-slate-300
          hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50/50 dark:hover:bg-slate-800/50
          focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:focus:border-cyan-400 dark:focus:ring-cyan-400/10
          transition-all duration-200 cursor-pointer outline-none
          ${isOpen ? 'border-cyan-500 ring-4 ring-cyan-500/10 dark:border-cyan-400 dark:ring-cyan-400/10' : ''}
        `}
        {...props}
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown 
          size={14} 
          className={`shrink-0 text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {isOpen && (
        <ul className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg overflow-hidden py-1 max-h-60 overflow-y-auto 
                       [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
          {options.map((opt, i) => (
            <li
              key={i}
              onClick={() => handleSelect(opt.value)}
              className={`
                px-3 py-1.5 text-sm cursor-pointer transition-colors
                ${opt.value === value 
                  ? 'bg-slate-50 dark:bg-slate-700/50 text-cyan-700 dark:text-cyan-400 font-semibold' 
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 hover:text-cyan-700 dark:hover:bg-slate-700/50 dark:hover:text-cyan-400'
                }
              `}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})

MarineSelect.displayName = 'MarineSelect'
