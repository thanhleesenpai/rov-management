export function MarineButton({ children, icon: Icon, variant = 'outline', className = '', ...props }) {
  const isIcon = variant === 'icon'
  const baseClasses = `flex items-center justify-center gap-2 transition-all duration-200 focus:outline-none shrink-0 ${
    isIcon ? 'p-1.5 rounded-md' : 'h-[34px] px-4 rounded-md font-sans text-sm font-medium'
  }`
  
  const variants = {
    outline: "bg-white border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50/50 hover:shadow-sm focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800/50 dark:focus:border-cyan-400 dark:focus:ring-cyan-400/10",
    solid: "bg-cyan-600 border border-transparent text-white hover:bg-cyan-500 hover:shadow-md focus:ring-4 focus:ring-cyan-500/20",
    danger: "bg-rose-500 border border-transparent text-white hover:bg-rose-600 hover:shadow-md focus:ring-4 focus:ring-rose-500/20",
    icon: "text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 dark:text-slate-400 dark:hover:text-cyan-400 dark:hover:bg-cyan-900/20 focus:ring-2 focus:ring-cyan-500/20"
  }

  const combinedClasses = `${baseClasses} ${variants[variant]} ${className}`

  return (
    <button className={combinedClasses} {...props}>
      {Icon && <Icon size={16} className={variant === 'outline' ? 'text-slate-500 dark:text-slate-400' : (variant === 'solid' || variant === 'danger') ? 'text-white' : ''} />}
      {children}
    </button>
  )
}
