type ActionIconProps = {
  className?: string;
};

export const BillEntryIcon = ({ className }: ActionIconProps) => (
  <svg className={className} viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <rect x="4" y="4" width="28" height="28" rx="10" fill="color-mix(in srgb, var(--meow-warm) 14%, white)" />
    <path
      d="M12 8.75h11.5c1.35 0 2.4 1.05 2.4 2.4v16.1l-2.25-1.25-2.2 1.25-2.2-1.25-2.2 1.25-2.2-1.25-2.25 1.25v-16.1c0-1.35 1.05-2.4 2.4-2.4Z"
      fill="white"
      opacity="0.86"
    />
    <path
      d="M12 8.75h11.5c1.35 0 2.4 1.05 2.4 2.4v16.1l-2.25-1.25-2.2 1.25-2.2-1.25-2.2 1.25-2.2-1.25-2.25 1.25v-16.1c0-1.35 1.05-2.4 2.4-2.4Z"
      fill="none"
      stroke="var(--meow-warm)"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
    <path d="M15.1 14.5h7.2M15.1 18.2h4.8" fill="none" stroke="var(--meow-warm)" strokeLinecap="round" strokeWidth="2" />
    <circle cx="23.5" cy="23" r="4.35" fill="var(--meow-warm)" stroke="white" strokeWidth="1.6" />
    <path d="M23.5 20.8v4.4M21.3 23h4.4" fill="none" stroke="white" strokeLinecap="round" strokeWidth="1.8" />
  </svg>
);

export const TimeEntryIcon = ({ className }: ActionIconProps) => (
  <svg className={className} viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <circle cx="18" cy="18" r="14" fill="var(--meow-accent-soft)" />
    <circle cx="18" cy="18" r="10.5" fill="white" opacity="0.84" />
    <circle cx="18" cy="18" r="10.5" fill="none" stroke="var(--meow-accent-strong)" strokeWidth="2" />
    <path d="M18 12.6v6l4.05 2.45" fill="none" stroke="var(--meow-accent-strong)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25" />
    <path d="M18 6.9v2M18 27.1v2M29.1 18h-2M8.9 18h-2" fill="none" stroke="var(--meow-accent-strong)" strokeLinecap="round" strokeWidth="1.8" opacity="0.86" />
    <path d="M25.65 10.35l1.35-1.35M9 27l1.35-1.35" fill="none" stroke="var(--meow-accent-strong)" strokeLinecap="round" strokeWidth="1.6" opacity="0.56" />
  </svg>
);
