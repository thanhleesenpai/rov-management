export function MarineButton({ children, icon: Icon, variant = 'outline', className = '', ...props }) {
  const isIcon = variant === 'icon'
  const baseClasses = `flex items-center justify-center gap-2 transition-all duration-200 focus:outline-none shrink-0 ${
    isIcon ? 'p-1.5 rounded-md' : 'h-9 px-4 rounded-md shadow-sm font-medium text-sm'
  }`
  
  const variants = {
    outline: "bg-transparent border border-border text-foreground hover:bg-muted hover:text-foreground focus:ring-2 focus:ring-ring/30",
    solid: "bg-primary border border-transparent text-primary-foreground hover:bg-primary/90 hover:shadow-md hover:shadow-primary/40 focus:ring-2 focus:ring-ring/30",
    danger: "bg-destructive border border-transparent text-destructive-foreground hover:bg-destructive/90 hover:shadow-md focus:ring-2 focus:ring-destructive/30",
    icon: "text-muted-foreground hover:text-foreground hover:bg-muted focus:ring-2 focus:ring-ring/30"
  }

  const combinedClasses = `${baseClasses} ${variants[variant]} ${className}`

  return (
    <button className={combinedClasses} {...props}>
      {Icon && <Icon size={16} className="text-current" />}
      {children}
    </button>
  )
}
