import type { SportsbookLeagueKey } from '@streets/shared';

type LogoKind = 'derrick' | 'route' | 'drills' | 'ice' | 'hurricane' | 'gold' | 'royal' | 'star' | 'blades' | 'aces' | 'outlaw';

type LogoSpec = { monogram: string; primary: string; secondary: string; ink: string; kind: LogoKind };

const LOCAL_LOGOS: Record<string, LogoSpec> = {
  'NFL:TUL': { monogram: 'TO', primary: '#20242b', secondary: '#d39248', ink: '#fff0c8', kind: 'derrick' },
  'NBA:TUL': { monogram: '66', primary: '#12627b', secondary: '#ee8140', ink: '#ffe29b', kind: 'route' },
  'MLB:TUL': { monogram: 'TD', primary: '#26384c', secondary: '#c76c4c', ink: '#fff0c8', kind: 'drills' },
  'NHL:TUL': { monogram: 'TI', primary: '#26384c', secondary: '#6fd0cc', ink: '#fff0c8', kind: 'ice' },
  'SOFTBALL:TUL': { monogram: 'GH', primary: '#12627b', secondary: '#ee8140', ink: '#fff0c8', kind: 'hurricane' },
  'NFL:BHV': { monogram: 'BG', primary: '#182c23', secondary: '#e2bd67', ink: '#fff4d2', kind: 'gold' },
  'NBA:BHV': { monogram: 'BR', primary: '#182c23', secondary: '#d8a83c', ink: '#fff4d2', kind: 'royal' },
  'MLB:BHV': { monogram: 'BS', primary: '#182c23', secondary: '#e3c477', ink: '#fff4d2', kind: 'star' },
  'NHL:BHV': { monogram: 'BB', primary: '#182c23', secondary: '#d8a83c', ink: '#fff4d2', kind: 'blades' },
  'SOFTBALL:BHV': { monogram: 'BA', primary: '#182c23', secondary: '#e08a9a', ink: '#fff4d2', kind: 'aces' },
  'NBA:LVR': { monogram: 'VA', primary: '#241c32', secondary: '#d83b59', ink: '#e9e0d2', kind: 'aces' },
  'MLB:LVR': { monogram: 'VO', primary: '#241c32', secondary: '#d83b59', ink: '#e9e0d2', kind: 'outlaw' },
};

export function hasSportsbookLocalTeamLogo(sport: SportsbookLeagueKey, teamId: string): boolean {
  return Boolean(LOCAL_LOGOS[`${sport}:${teamId}`]);
}

function MarkDetail({ kind, secondary, ink }: { kind: LogoKind; secondary: string; ink: string }) {
  if (kind === 'derrick') return <><path d="M19 32h10M21 29h6M22 26h4M24 11v15M18 32l6-21 6 21M18 16h12" stroke={secondary} strokeWidth="1.7" strokeLinecap="round" /><circle cx="24" cy="10" r="2" fill={ink} /></>;
  if (kind === 'route') return <><path d="M18 39c1-9 1-17 5-27m0 0c4 10 4 18 5 27" stroke={ink} strokeWidth="3" strokeLinecap="round" /><path d="M24 13v3m0 5v3m0 5v3" stroke={secondary} strokeWidth="2" strokeLinecap="round" /></>;
  if (kind === 'drills') return <><path d="m15 31 9-16 9 16M18 34l6-9 6 9" stroke={secondary} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /><circle cx="24" cy="19" r="2" fill={ink} /></>;
  if (kind === 'ice') return <><path d="m24 10 3 8 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1 3-8Z" fill={secondary} stroke={ink} strokeWidth="1.2" /></>;
  if (kind === 'hurricane') return <><path d="M32 13c-9 0-14 4-14 9 0 4 4 6 8 5 5-1 7-6 3-8-3-1-6 1-6 3" stroke={secondary} strokeWidth="2.6" strokeLinecap="round" /><path d="M29 12c3 2 5 4 6 7" stroke={ink} strokeWidth="1.5" strokeLinecap="round" /></>;
  if (kind === 'gold') return <path d="M17 13h9c7 0 8 8 2 10 7 2 4 12-3 12h-8V13Zm3 3v6h5c4 0 4-6 0-6h-5Zm0 10v6h5c4 0 4-6 0-6h-5Z" fill={secondary} />;
  if (kind === 'royal') return <><path d="m14 18 4 4 6-9 6 9 4-4-3 15H17l-3-15Z" fill={secondary} stroke={ink} strokeWidth="1.3" /><circle cx="18" cy="18" r="1.4" fill={ink} /><circle cx="24" cy="13" r="1.4" fill={ink} /><circle cx="30" cy="18" r="1.4" fill={ink} /></>;
  if (kind === 'star') return <path d="m24 10 3.2 8.4 8.9.5-6.9 5.7 2.3 8.7-7.5-4.8-7.5 4.8 2.3-8.7-6.9-5.7 8.9-.5L24 10Z" fill={secondary} stroke={ink} strokeWidth="1.2" />;
  if (kind === 'blades') return <><path d="m16 32 14-18M20 35l12-15M15 16l17 17" stroke={secondary} strokeWidth="2.2" strokeLinecap="round" /><circle cx="16" cy="32" r="2.5" fill={ink} /><circle cx="32" cy="16" r="2.5" fill={ink} /></>;
  if (kind === 'aces') return <path d="M24 10c-2 4-8 7-8 13 0 6 5 9 8 13 3-4 8-7 8-13 0-6-6-9-8-13Zm0 10 3 8h-6l3-8Z" fill={secondary} stroke={ink} strokeWidth="1.3" />;
  return <><path d="M15 17c2-4 5-6 9-6s7 2 9 6l-3 1 4 4-4 2 2 7H16l2-7-4-2 4-4-3-1Z" fill={secondary} stroke={ink} strokeWidth="1.2" /><path d="M19 27h10" stroke={ink} strokeWidth="2" /></>;
}

export function SportsbookLocalTeamLogo({ sport, teamId }: { sport: SportsbookLeagueKey; teamId: string }) {
  const spec = LOCAL_LOGOS[`${sport}:${teamId}`];
  if (!spec) return null;
  return (
    <svg className="se-sportsbook-local-logo" viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
      <path d="M7 5h34v20c0 9-6.8 15.7-17 19C13.8 40.7 7 34 7 25V5Z" fill={spec.primary} stroke={spec.secondary} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M11 9h26v15c0 6.8-5 11.8-13 14.6C16 35.8 11 30.8 11 24V9Z" stroke={spec.ink} strokeOpacity=".32" strokeWidth="1" />
      <MarkDetail kind={spec.kind} secondary={spec.secondary} ink={spec.ink} />
      <text x="24" y="43" textAnchor="middle" fill={spec.ink} fontFamily="Arial, sans-serif" fontSize="5.5" fontWeight="900" letterSpacing=".5">{spec.monogram}</text>
    </svg>
  );
}
