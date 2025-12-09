import { ref } from 'vue'

export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

const toasts = ref<Toast[]>([])

let toastIdCounter = 0

export function useToast() {
  const toast = (options: Omit<Toast, 'id'>) => {
    const id = `toast-${++toastIdCounter}`
    const duration = options.duration ?? 5000

    const newToast: Toast = {
      id,
      ...options,
    }

    toasts.value.push(newToast)

    if (duration > 0) {
      setTimeout(() => {
        dismiss(id)
      }, duration)
    }

    return id
  }

  const dismiss = (id: string) => {
    const index = toasts.value.findIndex((t) => t.id === id)
    if (index > -1) {
      toasts.value.splice(index, 1)
    }
  }

  const success = (title: string, description?: string, duration?: number) => {
    return toast({ title, description, variant: 'success', duration })
  }

  const error = (title: string, description?: string, duration?: number) => {
    return toast({ title, description, variant: 'error', duration })
  }

  const warning = (title: string, description?: string, duration?: number) => {
    return toast({ title, description, variant: 'warning', duration })
  }

  const info = (title: string, description?: string, duration?: number) => {
    return toast({ title, description, variant: 'info', duration })
  }

  return {
    toasts,
    toast,
    dismiss,
    success,
    error,
    warning,
    info,
  }
}
