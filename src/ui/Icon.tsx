import type { SVGProps } from 'react'

export type IconName =
  | 'alerts'
  | 'arrow-down'
  | 'arrow-up'
  | 'backup'
  | 'budget'
  | 'calendar'
  | 'chevron-right'
  | 'close'
  | 'dashboard'
  | 'document'
  | 'download'
  | 'edit'
  | 'goal'
  | 'insurance'
  | 'investment'
  | 'lock'
  | 'loan'
  | 'menu'
  | 'more'
  | 'net-worth'
  | 'plus'
  | 'reports'
  | 'search'
  | 'settings'
  | 'shield'
  | 'transaction'
  | 'trash'
  | 'upload'

const paths: Record<IconName, React.ReactNode> = {
  alerts: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  'arrow-down': (
    <>
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </>
  ),
  'arrow-up': (
    <>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </>
  ),
  backup: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </>
  ),
  budget: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M16 12h5" />
      <path d="M7 9h5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </>
  ),
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  document: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h6" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" />
    </>
  ),
  goal: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  insurance: (
    <>
      <path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z" />
      <path d="m9 12 2 2 4-5" />
    </>
  ),
  investment: (
    <>
      <path d="M3 20h18" />
      <path d="m5 16 4-5 4 3 6-8" />
      <path d="M15 6h4v4" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  loan: (
    <>
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <path d="M7 10h10M7 15h4" />
      <path d="M16 15h1" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  'net-worth': (
    <>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19V3" />
      <path d="M2 21h22" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  reports: (
    <>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19V3" />
      <path d="M2 21h22" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a2 2 0 0 0 .4 2.2l.1.1-2.8 2.8-.1-.1a2 2 0 0 0-2.2-.4 2 2 0 0 0-1.2 1.8V22H9.6v-.2A2 2 0 0 0 8.4 20a2 2 0 0 0-2.2.4l-.1.1-2.8-2.8.1-.1A2 2 0 0 0 3.8 15 2 2 0 0 0 2 13.8H2V10h.2A2 2 0 0 0 4 8.8a2 2 0 0 0-.4-2.2l-.1-.1 2.8-2.8.1.1A2 2 0 0 0 8.6 4 2 2 0 0 0 9.8 2H14v.2A2 2 0 0 0 15.2 4a2 2 0 0 0 2.2-.4l.1-.1 2.8 2.8-.1.1a2 2 0 0 0-.4 2.2 2 2 0 0 0 1.8 1.2h.2V14h-.2a2 2 0 0 0-2.2 1z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z" />
      <path d="M12 8v4M12 16h.01" />
    </>
  ),
  transaction: (
    <>
      <path d="M7 7h13l-3-3M17 17H4l3 3" />
      <path d="M20 7 17 4M4 17l3 3" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V3" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 21h14" />
    </>
  ),
}

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 20, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {paths[name]}
    </svg>
  )
}
