// Recharts requires hex values — cannot use Tailwind classes or CSS variables.
// Centralised here so chart themes stay consistent and easy to update.

export const TRIP_COLORS = {
  planned:   '#3b82f6', // blue-500
  ongoing:   '#22c55e', // green-500
  completed: '#9ca3af', // gray-400
  cancelled: '#ef4444', // red-500
}

export const DIVE_COLORS = {
  pending: '#9ca3af', // gray-400
  running: '#3b82f6', // blue-500
  done:    '#22c55e', // green-500
  failed:  '#ef4444', // red-500
}

export const ROV_PALETTE = [
  '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ef4444', '#06b6d4', '#f97316', '#ec4899',
]

export const LINE_COLORS = {
  trips: '#3b82f6',
  dives: '#22c55e',
  media: '#f59e0b',
}
