import { useState, type ReactNode } from 'react'
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
  navigation[0]!.items[0]!,
  navigation[0]!.items[1]!,
  navigation[0]!.items[3]!,
  navigation[2]!.items[1]!,
] as const

export function AppShell({ children }: { children: ReactNode }) {
  const { lock } = useSecurity()
  const { data, alerts } = useFinance()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const profile = data.profiles[0]
  const activeAlerts = alerts.filter((alert) => alert.severity !== 'info').length

  const closeDrawer = () => setDrawerOpen(false)

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
      <aside className={`sidebar${drawerOpen ? ' sidebar-open' : ''}`}>
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
                  onClick={closeDrawer}
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

      <div className="app-main">
        <header className="mobile-header">
          <button
            type="button"
            className="icon-button"
            aria-label="Open navigation"
            onClick={() => setDrawerOpen(true)}
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
        <main className="page-content" key={location.pathname}>
          {children}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {mobileNavigation.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `bottom-nav-item${isActive ? ' bottom-nav-active' : ''}`
            }
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label.split(' ')[0]}</span>
            {item.to === '/alerts' && activeAlerts > 0 ? (
              <span className="bottom-count">{activeAlerts}</span>
            ) : null}
          </NavLink>
        ))}
        <button
          type="button"
          className="bottom-nav-item"
          onClick={() => setDrawerOpen(true)}
        >
          <Icon name="more" size={20} />
          <span>More</span>
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
