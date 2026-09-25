import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

import type { IconName } from '../ui/Icon'
import { Icon } from '../ui/Icon'
import { useFinance } from './FinanceContext'
import { useSecurity } from './SecurityContext'

interface NavigationItem {
  to: string
  label: string
  icon: IconName
}

const navigation: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: 'dashboard' },
      { to: '/transactions', label: 'Transactions', icon: 'transaction' },
      { to: '/plan', label: 'Plan & cash flow', icon: 'budget' },
      { to: '/net-worth', label: 'Net worth', icon: 'net-worth' },
    ],
  },
  {
    label: 'Your finances',
    items: [
      { to: '/loans', label: 'Loans & credit', icon: 'loan' },
      { to: '/investments', label: 'Investments', icon: 'investment' },
      { to: '/insurance', label: 'Insurance', icon: 'insurance' },
      { to: '/goals', label: 'Goals', icon: 'goal' },
    ],
  },
  {
    label: 'Review',
    items: [
      { to: '/reports', label: 'Reports', icon: 'reports' },
      { to: '/alerts', label: 'Alerts', icon: 'alerts' },
      { to: '/settings', label: 'Settings', icon: 'settings' },
    ],
  },
]

const mobileNavigation = [
  { ...navigation[0]!.items[0]!, shortLabel: 'Home' },
  { ...navigation[0]!.items[1]!, shortLabel: 'Activity' },
  { ...navigation[0]!.items[2]!, shortLabel: 'Plan' },
  { ...navigation[0]!.items[3]!, shortLabel: 'Worth' },
] as const

export function AppShell({ children }: { children: ReactNode }) {
  const { lock } = useSecurity()
  const { data, alerts } = useFinance()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [focusDestination, setFocusDestination] = useState<string | null>(null)
  const drawerRef = useRef<HTMLElement>(null)
  const drawerTriggerRef = useRef<HTMLButtonElement>(null)
  const restoreTriggerFocus = useRef(false)
  const pageRef = useRef<HTMLElement>(null)
  const profile = data.profiles[0]
  const activeAlerts = alerts.filter((alert) => alert.severity !== 'info').length
  const moreActive = !mobileNavigation.some((item) => item.to === location.pathname)

  const openDrawer = (event: MouseEvent<HTMLButtonElement>) => {
    drawerTriggerRef.current = event.currentTarget
    restoreTriggerFocus.current = false
    setFocusDestination(null)
    setDrawerOpen(true)
  }
  const closeDrawer = () => {
    restoreTriggerFocus.current = true
    setDrawerOpen(false)
  }
  const navigateFromDrawer = (path: string) => {
    restoreTriggerFocus.current = false
    setFocusDestination(path)
    setDrawerOpen(false)
  }

  useEffect(() => {
    if (!drawerOpen && restoreTriggerFocus.current) {
      restoreTriggerFocus.current = false
      drawerTriggerRef.current?.focus()
    }
  }, [drawerOpen])

  useEffect(() => {
    if (drawerOpen || focusDestination !== location.pathname) return
    const page = pageRef.current
    if (!page) return

    const focusHeading = () => {
      const heading = page.querySelector<HTMLHeadingElement>('.page-header h1')
      if (!heading) return false
      heading.focus()
      setFocusDestination(null)
      return true
    }

    if (focusHeading()) return
    const observer = new MutationObserver(() => {
      if (focusHeading()) observer.disconnect()
    })
    observer.observe(page, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [drawerOpen, focusDestination, location.pathname])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  useEffect(() => {
    if (!drawerOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const drawer = drawerRef.current
    drawer?.querySelector<HTMLButtonElement>('.sidebar-close')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDrawer()
      }
      if (event.key !== 'Tab' || !drawer) return
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      )
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [drawerOpen])

  return (
    <div className="app-frame">
      {drawerOpen ? (
        <button
          type="button"
          className="drawer-scrim"
          aria-label="Close navigation"
          onClick={closeDrawer}
        />
      ) : null}
      <aside
        id="navigation-drawer"
        ref={drawerRef}
        className={`sidebar${drawerOpen ? ' sidebar-open' : ''}`}
        role="dialog"
        aria-label="All sections"
        aria-modal={drawerOpen ? true : undefined}
        aria-hidden={!drawerOpen}
        inert={!drawerOpen}
      >
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="net-worth" size={21} />
          </span>
          <div>
            <strong>FinTrack</strong>
            <span>Private workspace</span>
          </div>
          <button
            type="button"
            className="icon-button sidebar-close"
            aria-label="Close navigation"
            onClick={closeDrawer}
          >
            <Icon name="close" />
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navigation.map((group) => (
            <div key={group.label} className="nav-group">
              <span className="nav-label">{group.label}</span>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `nav-item${isActive ? ' nav-item-active' : ''}`
                  }
                  onClick={(event) => {
                    if (
                      event.defaultPrevented ||
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return
                    navigateFromDrawer(item.to)
                  }}
                >
                  <Icon name={item.icon} size={19} />
                  <span>{item.label}</span>
                  {item.to === '/alerts' && activeAlerts > 0 ? (
                    <span className="nav-count">{activeAlerts}</span>
                  ) : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-summary">
            <span className="avatar" aria-hidden="true">
              {profile?.name.slice(0, 1).toUpperCase() || 'F'}
            </span>
            <div>
              <strong>{profile?.name || 'FinTrack user'}</strong>
              <span>Stored on this device</span>
            </div>
          </div>
          <button type="button" className="button button-secondary" onClick={lock}>
            <Icon name="lock" size={17} />
            Lock
          </button>
        </div>
      </aside>

      <div className="app-main" inert={drawerOpen}>
        <header className="mobile-header">
          <button
            type="button"
            className="icon-button"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            aria-controls="navigation-drawer"
            onClick={openDrawer}
          >
            <Icon name="menu" />
          </button>
          <strong>FinTrack</strong>
          <button
            type="button"
            className="icon-button"
            aria-label="Lock application"
            onClick={lock}
          >
            <Icon name="lock" />
          </button>
        </header>
        <main className="page-content" key={location.pathname} ref={pageRef}>
          {children}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Primary sections" inert={drawerOpen}>
        {mobileNavigation.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `bottom-nav-item${isActive ? ' bottom-nav-active' : ''}`
            }
            onClick={() => setFocusDestination(null)}
          >
            <Icon name={item.icon} size={20} />
            <span>{item.shortLabel}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`bottom-nav-item${moreActive ? ' bottom-nav-active' : ''}`}
          aria-label={
            activeAlerts > 0
              ? `More sections, ${activeAlerts} active alerts`
              : 'More sections'
          }
          aria-expanded={drawerOpen}
          aria-controls="navigation-drawer"
          onClick={openDrawer}
        >
          <Icon name="more" size={20} />
          <span>More</span>
          {activeAlerts > 0 ? (
            <span className="bottom-count" aria-hidden="true">
              {activeAlerts}
            </span>
          ) : null}
        </button>
      </nav>
    </div>
  )
}

export function DataLoadingScreen() {
  return (
    <main className="center-screen" aria-label="Opening encrypted data">
      <div className="stack" style={{ width: 'min(460px, 90vw)' }}>
        <div className="skeleton" style={{ height: 34, width: '55%' }} />
        <div className="skeleton" style={{ height: 18, width: '80%' }} />
        <div className="skeleton" style={{ height: 180, marginTop: 14 }} />
      </div>
    </main>
  )
}

export function DataErrorScreen({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  const { lock } = useSecurity()
  return (
    <main className="center-screen">
      <section className="card empty-state">
        <span className="badge badge-danger">Encrypted data unavailable</span>
        <h1>FinTrack could not open the workspace</h1>
        <p>{message}</p>
        <div className="cluster">
          <button type="button" className="button" onClick={onRetry}>
            Try again
          </button>
          <button type="button" className="button button-secondary" onClick={lock}>
            Lock
          </button>
        </div>
      </section>
    </main>
  )
}
