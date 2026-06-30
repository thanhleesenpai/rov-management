// Recharts requires hex values — cannot use Tailwind classes or CSS variables.
// Centralised here so chart themes stay consistent and easy to update.
// Palette: cyan/emerald/rose/violet — technical instrument tones, not candy-bright primaries.

export const PROJECT_COLORS = {
  planned:   '#60a5fa', // blue-400  — soft, unstarted
  ongoing:   '#06b6d4', // cyan-500  — active/live (matches MarineTableStatus ping)
  completed: '#6b7280', // gray-500  — neutral done
  cancelled: '#f43f5e', // rose-500  — alert, less harsh than pure red
}

export const TRIP_COLORS = {
  pending: '#6b7280', // gray-500
  running: '#06b6d4', // cyan-500
  done:    '#10b981', // emerald-500
  failed:  '#f43f5e', // rose-500
}

export const ROV_PALETTE = [
  '#06b6d4', // cyan-500
  '#10b981', // emerald-500
  '#60a5fa', // blue-400
  '#a78bfa', // violet-400
  '#f43f5e', // rose-500
  '#34d399', // emerald-400
  '#818cf8', // indigo-400
  '#fb923c', // orange-400
]

export const LINE_COLORS = {
  projects: '#06b6d4', // cyan-500
  trips: '#10b981', // emerald-500
  media: '#f59e0b', // amber-500
}
