import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR').format(new Date(date))
}

export function daysUntil(date: string | null): number | null {
  if (!date) return null
  const diff = new Date(date).getTime() - new Date().getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export type SemaphoreStatus = 'green' | 'yellow' | 'red'

export function getSemaphoreStatus(expiresAt: string | null): SemaphoreStatus {
  const days = daysUntil(expiresAt)
  if (days === null || days < 0) return 'red'
  if (days <= 30) return 'red'
  if (days <= 60) return 'yellow'
  return 'green'
}
