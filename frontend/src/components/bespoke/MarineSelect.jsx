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
          bg-background border border-input rounded-md shadow-sm px-3 py-2
          font-sans text-sm font-medium text-foreground
          hover:border-ring/50 hover:bg-muted/20
          focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/30
          transition-all duration-200 cursor-pointer outline-none
          ${isOpen ? 'border-ring ring-2 ring-ring/30' : ''}
        `}
        {...props}
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown 
          size={14} 
          className={`shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {isOpen && (
        <ul className="absolute z-50 mt-1 w-full bg-card border border-border rounded-md shadow-lg overflow-hidden py-1 max-h-60 overflow-y-auto 
                       [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted">
          {options.map((opt, i) => (
            <li
              key={i}
              onClick={() => handleSelect(opt.value)}
              className={`
                px-3 py-1.5 text-sm cursor-pointer transition-colors
                ${opt.value === value 
                  ? 'bg-muted/50 text-primary font-semibold' 
                  : 'text-foreground hover:bg-muted hover:text-primary'
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
