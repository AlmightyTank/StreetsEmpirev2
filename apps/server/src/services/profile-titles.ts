import type { PublicAwardDto } from '@streets/shared';

const profileTitleLabels: Record<string, string> = {
  'national-number-one': 'The National Crown',
  'city-boss': 'The City Crown',
  'top-ten': 'Top-Ten Made',
  climber: 'Fast-Lane Climber',

  'first-stack': 'Stack Starter',
  'six-figures': 'Six-Figure Smooth',
  'quarter-million': 'Quarter-Mill Playa',
  millionaire: 'Million-Dollar Don',
  'empire-builder': 'Empire Don',

  'knock-knock': 'Door Kicker',
  'first-blood': 'First-Hit Finisher',
  enforcer: 'Block Enforcer',
  warpath: 'Warpath Boss',
  'made-enemies': 'Marked for Smoke',
  'held-the-line': 'Line Holder',
  untouchable: 'Untouchable Operator',
  'rolling-deep': 'Deep Crew Driver',
  'clean-pass': 'Clean-Pass Caller',
  'bad-batch': 'Batch Baron',
  'burned-stable': 'Stable Burner',
  boosted: 'Ride Jacker',
  'chop-shop-regular': 'Chop-Shop Ace',
  'silver-tongue': 'Silver-Tongued Pimp',
  recruiter: 'Crew Whisperer',

  'street-intel': 'Street-Eye',
  'wire-tapper': 'Wire Ghost',
  'eyes-everywhere': 'All-Seeing Pimp',

  'favor-done': 'Job Closer',
  connected: 'Well Connected',
  'shotgun-trust': 'Shotgun Trusted',
  'tek-runner': 'Tek Runner',
  'heavy-metal': 'Heavy Metal Boss',

  'first-hideout-upgrade': 'Keyholder',
  'hideout-regular': 'House Money Regular',
  'room-maxed': 'Room Boss',
  'fully-built-hideout': 'Fully Built Kingpin',

  veteran: 'Old-School Player',
  'past-winner': 'Former Crown',
  'hall-of-fame': 'Hall Made',
  'top-finisher': 'Top-Ten Alumni',
  'beta-tester': 'Beta Original',

  'ghost-of-the-block': 'The Quiet Ghost',
  'top-shelf-operator': 'Top-Shelf Pimp',
  'full-rack-enforcer': 'Fully Strapped',
  'road-king': 'Open-Road King',
  'no-paper-trail': 'Clean-Slate Ghost',
  'corner-boss': 'Corner Crown',
};

function titleFallback(title: string): string {
  return title.toLowerCase().startsWith('the ') ? title : `The ${title}`;
}

function titleFromKeyFallback(key: string): string {
  return titleFallback(key.split('-').filter(Boolean).map((part) => (
    part.charAt(0).toUpperCase() + part.slice(1)
  )).join(' '));
}

export function profileTitleForAward(award: Pick<PublicAwardDto, 'key' | 'title'>): string {
  return profileTitleLabels[award.key] ?? titleFallback(award.title);
}

export function profileTitleForKey(key: string): string {
  return profileTitleLabels[key] ?? titleFromKeyFallback(key);
}
