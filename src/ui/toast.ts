import { reactive } from 'vue'

export type ToastVariant = 'default' | 'success' | 'error'

export interface ToastItem {
  id: string
  title?: string
  description?: string
  variant: ToastVariant
  timeoutMs: number
}

export const toastStore = reactive<{ items: ToastItem[] }>({
  items: [],
})

export function toast(input: {
  title?: string
  description?: string
  variant?: ToastVariant
  timeoutMs?: number
}) {
  const id = crypto.randomUUID()
  const item: ToastItem = {
    id,
    title: input.title,
    description: input.description,
    variant: input.variant ?? 'default',
    timeoutMs: input.timeoutMs ?? 1800,
  }
  toastStore.items = [...toastStore.items, item]

  window.setTimeout(() => {
    toastStore.items = toastStore.items.filter((t) => t.id !== id)
  }, item.timeoutMs)
}

