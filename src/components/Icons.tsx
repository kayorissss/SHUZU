/** Набор иконок SHUZU — единый штрих 1.75, размер 24. */
import type { SVGProps } from 'react';
import type React from 'react';

type P = SVGProps<SVGSVGElement>;

const base = (props: P) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
});

export const IconPower = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5v8.5" />
    <path d="M6.8 6.8a8 8 0 1 0 10.4 0" />
  </svg>
);

export const IconSettings = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 4.7a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.1a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

export const IconGlobe = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3c2.5 2.4 3.9 5.6 3.9 9s-1.4 6.6-3.9 9c-2.5-2.4-3.9-5.6-3.9-9s1.4-6.6 3.9-9z" />
  </svg>
);

export const IconUser = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.5 20.2a7.6 7.6 0 0 1 15 0" />
  </svg>
);

export const IconStar = (p: P) => (
  <svg {...base(p)}>
    <path d="m12 3.6 2.6 5.3 5.9.86-4.25 4.14 1 5.86-5.25-2.76-5.25 2.76 1-5.86L3.5 9.76l5.9-.86z" />
  </svg>
);

export const IconSearch = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.6" />
    <path d="m16 16 4.5 4.5" />
  </svg>
);

export const IconPlus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconClipboard = (p: P) => (
  <svg {...base(p)}>
    <rect x="8" y="3.5" width="8" height="3.6" rx="1.3" />
    <path d="M16 5.4h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h2" />
    <path d="M9 12.5h6M9 16h4" />
  </svg>
);

export const IconQr = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.4" />
    <rect x="14" y="3.5" width="6.5" height="6.5" rx="1.4" />
    <rect x="3.5" y="14" width="6.5" height="6.5" rx="1.4" />
    <path d="M14 14h3v3h-3zM20.5 14v3M14 20.5h3M20.5 20.5h.01" />
  </svg>
);

export const IconDots = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="5.5" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="18.5" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

export const IconChevronRight = (p: P) => (
  <svg {...base(p)}>
    <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
  </svg>
);

export const IconChevronLeft = (p: P) => (
  <svg {...base(p)}>
    <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />
  </svg>
);

export const IconChevronDown = (p: P) => (
  <svg {...base(p)}>
    <path d="m5.5 9.5 6.5 6.5 6.5-6.5" />
  </svg>
);

export const IconX = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconCheck = (p: P) => (
  <svg {...base(p)}>
    <path d="m4.5 12.5 5 5 10-11" />
  </svg>
);

export const IconMinus = (p: P) => (
  <svg {...base(p)} strokeWidth={1.6}>
    <path d="M5 12h14" />
  </svg>
);

export const IconSquare = (p: P) => (
  <svg {...base(p)} strokeWidth={1.6}>
    <rect x="5.5" y="5.5" width="13" height="13" rx="2" />
  </svg>
);

export const IconRestore = (p: P) => (
  <svg {...base(p)} strokeWidth={1.6}>
    <rect x="4.5" y="7.5" width="11" height="11" rx="2" />
    <path d="M8.5 5.5h9a2 2 0 0 1 2 2v9" />
  </svg>
);

export const IconZap = (p: P) => (
  <svg {...base(p)}>
    <path d="M13.5 2.5 5 13.5h6l-.5 8L19 10.5h-6z" />
  </svg>
);

export const IconShield = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.2 5 6v5.6c0 4.3 2.9 7.6 7 9.2 4.1-1.6 7-4.9 7-9.2V6z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </svg>
);

export const IconActivity = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 12.5h3.6l2.2-6 3.6 12 2.3-6H21" />
  </svg>
);

export const IconStethoscope = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 3.5v5.8a4.2 4.2 0 0 0 8.4 0V3.5" />
    <path d="M9.2 13.2v2.4a4.6 4.6 0 0 0 9.2 0v-2" />
    <circle cx="18.4" cy="11.3" r="2.1" />
    <path d="M3.6 3.5h2.6M12.2 3.5h2.6" />
  </svg>
);

export const IconRadar = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.6" />
    <circle cx="12" cy="12" r="4.6" />
    <path d="M12 12 18 6.2" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconDownload = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 4v10.5" />
    <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
    <path d="M4.5 19.5h15" />
  </svg>
);

export const IconRefresh = (p: P) => (
  <svg {...base(p)}>
    <path d="M20 12a8 8 0 1 1-2.4-5.7" />
    <path d="M20.2 4.2v4.4h-4.4" />
  </svg>
);

export const IconTrash = (p: P) => (
  <svg {...base(p)}>
    <path d="M4.5 7h15M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2" />
    <path d="M6.5 7 7.4 19a1.8 1.8 0 0 0 1.8 1.6h5.6a1.8 1.8 0 0 0 1.8-1.6L17.5 7" />
    <path d="M10.5 11v5.5M13.5 11v5.5" />
  </svg>
);

export const IconCopy = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="11" height="11" rx="2.2" />
    <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-6A3.5 3.5 0 0 0 3 6.5v6A2.5 2.5 0 0 0 5.5 15" />
  </svg>
);

export const IconFile = (p: P) => (
  <svg {...base(p)}>
    <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z" />
    <path d="M14 3.5V8h4.5" />
    <path d="M9 13h6M9 16.5h4" />
  </svg>
);

export const IconCamera = (p: P) => (
  <svg {...base(p)}>
    <path d="M4.5 8.5h2.2l1.4-2.2h7.8l1.4 2.2h2.2a1.6 1.6 0 0 1 1.6 1.6v8a1.6 1.6 0 0 1-1.6 1.6H4.5A1.6 1.6 0 0 1 2.9 18v-8a1.6 1.6 0 0 1 1.6-1.6z" />
    <circle cx="12" cy="13.6" r="3.2" />
  </svg>
);

export const IconAlert = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 4.5 2.9 20h18.2z" />
    <path d="M12 10v4.2M12 17.3h.01" />
  </svg>
);

export const IconInfo = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.8" />
    <path d="M12 11v5.5M12 8h.01" />
  </svg>
);

export const IconServer = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="4" width="17" height="6" rx="1.8" />
    <rect x="3.5" y="14" width="17" height="6" rx="1.8" />
    <path d="M7 7h.01M7 17h.01" />
  </svg>
);

export const IconGauge = (p: P) => (
  <svg {...base(p)}>
    <path d="M4.2 17a8.5 8.5 0 1 1 15.6 0" />
    <path d="M12 13.5 15.5 10" />
    <circle cx="12" cy="14" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const IconPalette = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-.9 2-1.8 0-.7-.3-1.1-.3-1.7 0-1 .8-1.7 1.8-1.7h1.6a3.4 3.4 0 0 0 3.4-3.4c0-4.6-3.9-8.4-8.5-8.4z" />
    <circle cx="8.2" cy="9.2" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="7.4" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="7.4" cy="13.4" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconBell = (p: P) => (
  <svg {...base(p)}>
    <path d="M17.5 10.5a5.5 5.5 0 0 0-11 0c0 4-1.5 5.5-1.5 5.5h14s-1.5-1.5-1.5-5.5z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </svg>
);

export const IconLock = (p: P) => (
  <svg {...base(p)}>
    <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </svg>
);

export const IconEye = (p: P) => (
  <svg {...base(p)}>
    <path d="M2.5 12s3.4-6.5 9.5-6.5S21.5 12 21.5 12s-3.4 6.5-9.5 6.5S2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
);

export const IconLogout = (p: P) => (
  <svg {...base(p)}>
    <path d="M14.5 4.5h3.2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3.2" />
    <path d="M10 8 6 12l4 4M6 12h8.5" />
  </svg>
);

export const IconExternal = (p: P) => (
  <svg {...base(p)}>
    <path d="M14 4.5h5.5V10" />
    <path d="M19.5 4.5 11 13" />
    <path d="M18 14.5v3.9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.9" />
  </svg>
);

export const IconArrowDown = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5.5v13M6.5 13l5.5 5.5L17.5 13" />
  </svg>
);

export const IconArrowUp = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 18.5v-13M17.5 11 12 5.5 6.5 11" />
  </svg>
);

export const IconFilter = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 6.5h16M7 12h10M10 17.5h4" />
  </svg>
);

export const IconBug = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 8.5a4 4 0 0 1 8 0v6a4 4 0 0 1-8 0z" />
    <path d="M8 11H4.5M8 15H5.5M16 11h3.5M16 15h2.5M9.5 5 8 3.5M14.5 5 16 3.5M12 3.5V6" />
  </svg>
);

export const IconSpeed = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 15.5a8.5 8.5 0 1 1 17 0" />
    <path d="m8 12 4 3.5L16 9" />
  </svg>
);

export const IconWifi = (p: P) => (
  <svg {...base(p)}>
    <path d="M2.5 8.5a14 14 0 0 1 19 0M6 12.2a9 9 0 0 1 12 0M9.2 15.8a4.4 4.4 0 0 1 5.6 0" />
    <circle cx="12" cy="19.2" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconRouter = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="13" width="18" height="7" rx="2" />
    <path d="M7 16.5h.01M10.5 16.5h.01" />
    <path d="M12 13V9.5M9 6.5a4.2 4.2 0 0 1 6 0" />
  </svg>
);

export const IconKey = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="14" r="4" />
    <path d="m11 11 8-8M16.5 5.5l2 2M14.5 7.5l2 2" />
  </svg>
);

export const IconClock = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const IconSparkle = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5 13.8 9l5.5 1.8-5.5 1.8L12 18l-1.8-5.4L4.7 10.8 10.2 9z" />
  </svg>
);

export const IconLogo = (p: P) => (
  <svg viewBox="0 0 48 48" fill="none" {...p}>
    <path
      d="M24 5.5 38 12.4v11.9c0 8.9-5.9 15.7-14 18.2-8.1-2.5-14-9.3-14-18.2V12.4z"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinejoin="round"
    />
    <path d="M24 16v9.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M18.6 20.2a7 7 0 1 0 10.8 0" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

/** Логотип-«печать» для иконки приложения и заставки. */
export const LogoMark = ({ size = 96, glow = true }: { size?: number; glow?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <defs>
      <linearGradient id="shuzu-g1" x1="14" y1="10" x2="82" y2="88" gradientUnits="userSpaceOnUse">
        <stop stopColor="#3EE0A8" />
        <stop offset="1" stopColor="#22C4E0" />
      </linearGradient>
      <linearGradient id="shuzu-g2" x1="30" y1="26" x2="66" y2="74" gradientUnits="userSpaceOnUse">
        <stop stopColor="#0B1210" />
        <stop offset="1" stopColor="#0B1210" stopOpacity="0.65" />
      </linearGradient>
      {glow && (
        <filter id="shuzu-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      )}
    </defs>
    <rect x="4" y="4" width="88" height="88" rx="26" fill="url(#shuzu-g1)" />
    <rect x="4.75" y="4.75" width="86.5" height="86.5" rx="25.3" stroke="#fff" strokeOpacity="0.22" strokeWidth="1.5" />
    <g filter={glow ? 'url(#shuzu-glow)' : undefined}>
      <path
        d="M48 22 68 32v14.5c0 11.6-7.9 20.4-20 23.5-12.1-3.1-20-11.9-20-23.5V32z"
        fill="url(#shuzu-g2)"
        stroke="#08110E"
        strokeOpacity="0.35"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M48 36v11.5" stroke="#EAFFF7" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M41 41.5a9.2 9.2 0 1 0 14 0" stroke="#EAFFF7" strokeWidth="3.4" strokeLinecap="round" />
    </g>
  </svg>
);

export default {
  IconPower,
  IconSettings,
  IconGlobe,
  IconUser,
  IconStar,
  IconSearch,
  IconPlus,
  IconClipboard,
  IconQr,
  IconDots,
  IconChevronRight,
  IconChevronLeft,
  IconChevronDown,
  IconX,
  IconCheck,
  IconMinus,
  IconSquare,
  IconRestore,
  IconZap,
  IconShield,
  IconActivity,
  IconStethoscope,
  IconRadar,
  IconDownload,
  IconRefresh,
  IconTrash,
  IconCopy,
  IconFile,
  IconCamera,
  IconAlert,
  IconInfo,
  IconServer,
  IconGauge,
  IconPalette,
  IconBell,
  IconLock,
  IconEye,
  IconLogout,
  IconExternal,
  IconArrowDown,
  IconArrowUp,
  IconFilter,
  IconBug,
  IconSpeed,
  IconWifi,
  IconRouter,
  IconKey,
  IconClock,
  IconSparkle,
  IconLogo,
};

export type IconComponent = (p: P) => React.ReactElement;
export type { P as IconProps };
