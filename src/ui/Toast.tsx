import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { newId } from '../domain/id'
import { Icon } from './Icon'

interface ToastMessage {
  id: string
  message: string
  tone: 'success' | 'error' | 'info'
}

interface ToastContextValue {
  notify: (message: string, tone?: ToastMessage['tone']) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([])
  const notify = useCallback(
    (message: string, tone: ToastMessage['tone'] = 'success') => {
      const id = newId()
      setMessages((current) => [...current, { id, message, tone }])
      window.setTimeout(() => {
        setMessages((current) => current.filter((item) => item.id !== id))
      }, 4_000)
    },
    [],
  )
  const value = useMemo(() => ({ notify }), [notify])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="false">
        {messages.map((message) => (
          <div key={message.id} className={`toast toast-${message.tone}`}>
            <Icon name={message.tone === 'error' ? 'alerts' : 'shield'} size={18} />
            <span>{message.message}</span>
            <button
              type="button"
              className="button-quiet"
              aria-label="Dismiss message"
              onClick={() =>
                setMessages((current) => current.filter((item) => item.id !== message.id))
              }
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
