// Web Push client helpers. These talk to the browser's PushManager; persisting
// the resulting subscription (and sending pushes) is the store's job.
import type { PushSubData } from '../store/store'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

/** True when this browser can do Web Push at all (and we have a VAPID key). */
export function isPushSupported(): boolean {
  return (
    !!VAPID_PUBLIC_KEY &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** Current notification permission, or 'unsupported'. */
export function pushPermission(): NotificationPermission | 'unsupported' {
  return 'Notification' in window ? Notification.permission : 'unsupported'
}

/** VAPID keys are base64url; PushManager wants a Uint8Array. */
function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  // Explicit ArrayBuffer backing so the type is Uint8Array<ArrayBuffer>, which
  // satisfies BufferSource for applicationServerKey.
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function toData(sub: PushSubscription): PushSubData {
  const json = sub.toJSON()
  return {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? ''
  }
}

/** The subscription this device already has, if any (no prompt). */
export async function getExistingSubscription(): Promise<PushSubData | null> {
  if (!isPushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return sub ? toData(sub) : null
}

/** Prompt for permission (if needed) and subscribe. Returns null if the user
 *  declined, or throws if something unexpected goes wrong. */
export async function subscribeToPush(): Promise<PushSubData | null> {
  if (!isPushSupported()) return null
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!)
    }))
  return toData(sub)
}

/** Unsubscribe this device. Returns the endpoint we dropped (for cleanup), or null. */
export async function unsubscribeFromPush(): Promise<string | null> {
  if (!isPushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return null
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  return endpoint
}
