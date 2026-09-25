import { App as CapacitorApp } from '@capacitor/app'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { readCompleteBackup } from '../data/backup'
import { getSecurityConfig, hasLocalData } from '../data/database'
import { restoreSystemSnapshot } from '../data/system-snapshot'
import {
  Workspace,
  changeWorkspacePin,
  initializeWorkspace,
  unlockWorkspace,
  wipeWorkspace,
} from '../data/workspace'
import type { UserProfile } from '../domain/types'
import {
  deleteSystemBackupSnapshot,
  readSystemBackupSnapshot,
} from '../platform/system-backup'

type SecurityStatus = 'checking' | 'setup' | 'locked' | 'unlocked'

export interface NewProfileInput {
  name: string
  locale: 'en-IN'
  currency: 'INR'
  monthlyIncomePaise: number
  essentialMonthlyPaise: number
  payDay: number
  emergencyFundMonths: number
}

interface SecurityContextValue {
  status: SecurityStatus
  workspace: Workspace | null
  bootstrapNotice: string | null
  hasPendingSystemRestore: boolean
  setup: (pin: string, profile: NewProfileInput) => Promise<void>
  restoreNew: (bytes: Uint8Array, backupPin: string, newAppPin: string) => Promise<void>
  unlock: (pin: string) => Promise<void>
  lock: () => void
  changePin: (currentPin: string, nextPin: string) => Promise<void>
  wipe: () => Promise<void>
  discardSystemRestore: () => Promise<void>
  setAutoLockMinutes: (minutes: number) => void
}

const SecurityContext = createContext<SecurityContextValue | null>(null)

function profileForInitialization(profile: UserProfile): NewProfileInput {
  return {
    name: profile.name,
    locale: profile.locale,
    currency: profile.currency,
    monthlyIncomePaise: profile.monthlyIncomePaise,
    essentialMonthlyPaise: profile.essentialMonthlyPaise,
    payDay: profile.payDay,
    emergencyFundMonths: profile.emergencyFundMonths,
  }
}

export function SecurityProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SecurityStatus>('checking')
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [bootstrapNotice, setBootstrapNotice] = useState<string | null>(null)
  const [pendingSystemSnapshot, setPendingSystemSnapshot] = useState<Uint8Array | null>(
    null,
  )
  const autoLockMinutes = useRef(5)
  const lastActivityAt = useRef(0)

  useEffect(() => {
    let active = true
    const bootstrap = async () => {
      try {
        if (!(await hasLocalData())) {
          const snapshot = await readSystemBackupSnapshot()
          if (snapshot) {
            if (active) {
              setPendingSystemSnapshot(snapshot)
              setBootstrapNotice(
                'Android restored an encrypted finance snapshot. Enter the app PIN to verify and open it; policy documents are not included.',
              )
              setStatus('locked')
            }
            return
          }
        }
        const config = await getSecurityConfig()
        if (active) setStatus(config ? 'locked' : 'setup')
      } catch (error) {
        if (!active) return
        setBootstrapNotice(
          error instanceof Error
            ? `Android backup could not be restored: ${error.message}`
            : 'Android backup could not be restored.',
        )
        setStatus('setup')
      }
    }
    void bootstrap()
    return () => {
      active = false
    }
  }, [])

  const lock = useCallback(() => {
    setWorkspace(null)
    setStatus((current) => (current === 'unlocked' ? 'locked' : current))
  }, [])

  useEffect(() => {
    if (status !== 'unlocked') return
    lastActivityAt.current = Date.now()
    const recordActivity = () => {
      lastActivityAt.current = Date.now()
    }
    const checkIdle = () => {
      const idleMilliseconds = Date.now() - lastActivityAt.current
      if (idleMilliseconds >= autoLockMinutes.current * 60_000) lock()
    }
    const activityEvents = ['pointerdown', 'keydown', 'touchstart'] as const
    for (const eventName of activityEvents) {
      document.addEventListener(eventName, recordActivity, { passive: true })
    }
    const timer = window.setInterval(checkIdle, 15_000)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        lastActivityAt.current = Date.now()
      } else {
        checkIdle()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    let disposed = false
    let removeNativeListener: (() => Promise<void>) | null = null
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) checkIdle()
      else lastActivityAt.current = Date.now()
    }).then((handle) => {
      if (disposed) void handle.remove()
      else removeNativeListener = () => handle.remove()
    })

    return () => {
      disposed = true
      for (const eventName of activityEvents) {
        document.removeEventListener(eventName, recordActivity)
      }
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(timer)
      if (removeNativeListener) void removeNativeListener()
    }
  }, [lock, status])

  const setup = useCallback(async (pin: string, profile: NewProfileInput) => {
    const nextWorkspace = await initializeWorkspace(pin, profile)
    setWorkspace(nextWorkspace)
    setStatus('unlocked')
  }, [])

  const restoreNew = useCallback(
    async (bytes: Uint8Array, backupPin: string, newAppPin: string) => {
      if (await hasLocalData()) {
        throw new Error('A workspace already exists; restore from Settings instead')
      }
      const backup = await readCompleteBackup(bytes, backupPin)
      const profile = backup.records.profiles[0]
      if (!profile) throw new Error('The backup does not contain a user profile')
      try {
        const nextWorkspace = await initializeWorkspace(
          newAppPin,
          profileForInitialization(profile),
        )
        await nextWorkspace.restoreComplete(bytes, backupPin)
        setWorkspace(nextWorkspace)
        setStatus('unlocked')
      } catch (error) {
        await wipeWorkspace()
        throw error
      }
    },
    [],
  )

  const unlock = useCallback(
    async (pin: string) => {
      const nextWorkspace = pendingSystemSnapshot
        ? new Workspace(await restoreSystemSnapshot(pendingSystemSnapshot, pin))
        : await unlockWorkspace(pin)
      setPendingSystemSnapshot(null)
      setBootstrapNotice(null)
      setWorkspace(nextWorkspace)
      lastActivityAt.current = Date.now()
      setStatus('unlocked')
    },
    [pendingSystemSnapshot],
  )

  const setAutoLockMinutes = useCallback((minutes: number) => {
    autoLockMinutes.current = Math.max(1, minutes)
  }, [])

  const changePin = useCallback(async (currentPin: string, nextPin: string) => {
    await changeWorkspacePin(currentPin, nextPin)
  }, [])

  const wipe = useCallback(async () => {
    await deleteSystemBackupSnapshot()
    await wipeWorkspace()
    setWorkspace(null)
    setBootstrapNotice(null)
    setStatus('setup')
  }, [])

  const discardSystemRestore = useCallback(async () => {
    await deleteSystemBackupSnapshot()
    setPendingSystemSnapshot(null)
    setBootstrapNotice(null)
    setStatus('setup')
  }, [])

  const value = useMemo<SecurityContextValue>(
    () => ({
      status,
      workspace,
      bootstrapNotice,
      hasPendingSystemRestore: pendingSystemSnapshot !== null,
      setup,
      restoreNew,
      unlock,
      lock,
      changePin,
      wipe,
      discardSystemRestore,
      setAutoLockMinutes,
    }),
    [
      bootstrapNotice,
      changePin,
      discardSystemRestore,
      lock,
      pendingSystemSnapshot,
      restoreNew,
      setAutoLockMinutes,
      setup,
      status,
      unlock,
      wipe,
      workspace,
    ],
  )

  return <SecurityContext.Provider value={value}>{children}</SecurityContext.Provider>
}

export function useSecurity() {
  const context = useContext(SecurityContext)
  if (!context) throw new Error('useSecurity must be used inside SecurityProvider')
  return context
}
