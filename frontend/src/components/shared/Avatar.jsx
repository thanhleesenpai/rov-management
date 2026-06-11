import { User } from 'lucide-react'
import { useState, useEffect } from 'react'

export default function Avatar({ name, avatarUrl, size = 'md', className = '' }) {
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    setBroken(false)
  }, [avatarUrl])

  const getInitials = (fullName) => {
    if (!fullName) return '?'
    const result = fullName
      .split(' ')
      .filter(n => n.length > 0)
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
    return result || '?'
  }

  const sizeClasses = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm',
    xl: 'w-12 h-12 text-base'
  }

  const baseClass = `${sizeClasses[size]} rounded-full flex items-center justify-center shrink-0 font-bold overflow-hidden ${className}`

  if (avatarUrl && !broken) {
    return (
      <img
        src={avatarUrl}
        alt={name || 'Avatar'}
        className={`${baseClass} object-cover`}
        onError={() => setBroken(true)}
      />
    )
  }

  const initials = getInitials(name)
  const bgColors = [
    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  ]

  const hashCode = (name || '').split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0)
    return a & a
  }, 0)
  const bgClass = bgColors[Math.abs(hashCode) % bgColors.length]

  return (
    <div className={`${baseClass} ${bgClass} border border-current/10`}>
      {initials === '?' ? (
        <User size={size === 'sm' ? 12 : size === 'md' ? 14 : size === 'lg' ? 16 : 18} />
      ) : (
        initials
      )}
    </div>
  )
}
