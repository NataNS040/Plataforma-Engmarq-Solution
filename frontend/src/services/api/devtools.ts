import { getMe } from './auth'

declare global {
  interface Window {
    engmarqApi?: { me: typeof getMe }
  }
}

/** Manual, read-only proof of communication; no automatic requests or UI changes. */
export function installApiDevtools() {
  if (import.meta.env.DEV) window.engmarqApi = Object.freeze({ me: getMe })
}
