import type { OnboardingGuideStepKey, OnboardingPageKey } from '@streets/shared';

/**
 * 1.0.0-B. Every word of onboarding and page help lives here, so the tutorial,
 * the page intros and the help panels never drift apart. Mechanics are described
 * the way the Rules page describes them; anything the ruleset decides links there.
 */

export interface IntroCard {
  key: string;
  eyebrow: string;
  title: string;
  body: string[];
  cta?: { label: string; to: string };
}

/** First login: three cards, only the loop. Everything else waits for its page. */
export const INTRO_CARDS: IntroCard[] = [
  {
    key: 'turns',
    eyebrow: '1 of 3 · Turns',
    title: 'Turns are your clock',
    body: [
      'Almost every action spends turns: scouting, producing, raiding, runs. Shopping and changing your payout do not.',
      'Turns refill on their own up to a cap. At the cap they stop filling, so spending them is how you grow.',
    ],
  },
  {
    key: 'scout',
    eyebrow: '2 of 3 · Scout',
    title: 'Scout the streets',
    body: [
      'Scouting sends your crew to work a district for a number of turns. It brings back cash and, sometimes, new hoes and thugs.',
      'Blocks only hold so many paying clients, so try different districts as you grow.',
    ],
  },
  {
    key: 'crew',
    eyebrow: '3 of 3 · Crew',
    title: 'Keep the crew happy',
    body: [
      'Hoes earn. Thugs cover the street and fight. An unhappy crew walks, and working them longer in one trip loses more.',
      'Condoms keep the girls working, and each thug wants a beer and a weapon. Stores, products, raids, the road, turf, the hideout and alliances are explained the first time you open them.',
    ],
    cta: { label: 'Go scout', to: '/game/scout' },
  },
];

export interface PageIntro {
  title: string;
  body: string;
}

/** Shown once, the first time each later system's page is opened. */
export const PAGE_INTROS: Record<OnboardingPageKey, PageIntro> = {
  stores: {
    title: 'Stores keep the crew supplied',
    body: 'Buy condoms, beer, medicine, weapons, thugs and Low-Riders here. Every shelf restocks on its own clock, and orders are all-or-nothing, so check the shelf before you plan around it.',
  },
  produce: {
    title: 'Production makes your own product',
    body: 'Producing spends turns and ingredients to cook product instead of buying it from Pip. Product feeds your crew and sells, but it draws Heat. Too much Heat drags your take and risks busts.',
  },
  combat: {
    title: 'Raids take from other players',
    body: 'Send fit thugs against a same-city target to take exposed cash and product. Defense is automatic. Recon shows what a target is holding, and a hit on you opens a revenge window. Wounded thugs sit out until they heal or get medicine.',
  },
  travel: {
    title: 'Runs take product on the road',
    body: 'A run loads Low-Riders, escorts, cash and cargo, and drives real roads to other cities to trade. Roads have police, and rivals can tail a run. Your Lookouts see trouble coming only in the last few minutes.',
  },
  turf: {
    title: 'Turf is blocks you hold',
    body: 'Claim a block by posting thugs on it, and hold it to earn from it. Rivals can push you off. Your Lookouts warn you shortly before a push lands, and allies in the city can send backup. Alliances that hold enough blocks control a city.',
  },
  hideout: {
    title: 'The hideout is this season\'s base',
    body: 'Rooms buy small, capped buffs: the Safe Room protects cash from raids, Lookouts see trouble sooner, the Workshop helps production and the Back Office adds to street take. Everything resets with the season.',
  },
  alliance: {
    title: 'Alliances fight together',
    body: 'Up to five crews. Allies cannot hit each other, share recon and revenge, coordinate on the Alliance Wire, and back each other up on turf and runs. Leaving means a cool-off before you can join another.',
  },
};

/** Which page intro a route belongs to, if any. */
export function pageIntroFor(pathname: string): OnboardingPageKey | null {
  if (pathname.startsWith('/game/stores')) return 'stores';
  if (pathname === '/game/produce' || pathname === '/game/products') return 'produce';
  if (pathname === '/game/combat') return 'combat';
  if (pathname === '/game/travel' || pathname === '/game/cities') return 'travel';
  if (pathname === '/game/turf' || pathname === '/game/blocks') return 'turf';
  if (pathname === '/game/hideout') return 'hideout';
  if (pathname === '/game/alliance' || pathname.startsWith('/game/alliances')) return 'alliance';
  return null;
}

export interface PageHelp {
  title: string;
  what: string;
  terms: Array<[string, string]>;
  risks: string[];
  /** Anchor on the Rules page. */
  rules: string;
}

const RULES = '/game/rules';

/** "How this page works" for every major page. */
export const PAGE_HELP: Record<string, PageHelp> = {
  dashboard: {
    title: 'Dashboard',
    what: 'Your operation at a glance: cash, turns, crew, ranks and the one or two things that need you right now.',
    terms: [['Net worth', 'The ranking value: cash plus what your crew, gear and product are worth.'], ['Turns', 'The clock most actions spend. They refill up to a cap.']],
    risks: ['Turns at the cap stop refilling. Unspent turns are growth you lose.'],
    rules: `${RULES}#rank`,
  },
  scout: {
    title: 'Scout',
    what: 'Send the crew to work a district for turns. Brings back cash, sometimes recruits and product.',
    terms: [['District', 'A part of the city. Each has its own clients and risks.'], ['Coverage', 'Armed thugs on the street protect the girls working it.']],
    risks: ['Long trips with an unhappy crew lose people.', 'Product on the street draws Heat.'],
    rules: `${RULES}#work`,
  },
  produce: {
    title: 'Produce',
    what: 'Cook product with turns and ingredients instead of buying it.',
    terms: [['Heat', 'Attention your product draws. It cools over time.'], ['Supply policy', 'Which product each job uses first.']],
    risks: ['High Heat drags your take and risks busts or arrest.'],
    rules: `${RULES}#products`,
  },
  products: {
    title: 'Products',
    what: 'Your product stash and how each product affects the crew and the street.',
    terms: [['Heat', 'Attention your product draws. It cools over time.']],
    risks: ['Running short of product can leave the crew unsupplied mid-trip.'],
    rules: `${RULES}#products`,
  },
  stores: {
    title: 'Stores',
    what: 'Buy supplies, weapons, thugs and cars; sell back what a store buys.',
    terms: [['Restock', 'Each shelf refills on its own clock; the shelf is all there is until then.'], ['Special order', 'Pay extra to source a sold-out item sooner.']],
    risks: ['Orders are all-or-nothing. If a price or shelf changes, the whole order stops.'],
    rules: `${RULES}#shops`,
  },
  combat: {
    title: 'Raids',
    what: 'Hit other crews in your city for cash and product, recon them, and answer the ones who hit you.',
    terms: [['Fit thugs', 'Thugs who are not wounded, posted or out on a run.'], ['Recon', 'A temporary report on a target.'], ['Revenge', 'A window to hit back after someone raids you.']],
    risks: ['Losing a raid wounds your thugs.', 'A raid starts your cooldown and can invite revenge.'],
    rules: `${RULES}#combat`,
  },
  travel: {
    title: 'Travel',
    what: 'Load a run and drive it to other cities to trade, or move your whole operation.',
    terms: [['Run', 'Cars, escorts, cash and cargo out on the road.'], ['Tail', 'A rival following your run to hit it.']],
    risks: ['Police stops and tails can cost cargo, cash and cars.', 'Everything on a run is away from home until it returns.'],
    rules: `${RULES}#travel`,
  },
  turf: {
    title: 'Turf',
    what: 'Claim, hold and fight over city blocks.',
    terms: [['Posted thugs', 'Thugs standing on a block. They are not home to work or defend.'], ['Push', 'A rival attack on a block you hold.'], ['City control', 'An alliance holding enough blocks runs the city.']],
    risks: ['Posted thugs and guns are exposed to pushes.', 'Without Lookouts, you only learn about a push when it lands.'],
    rules: `${RULES}#turf`,
  },
  hideout: {
    title: 'Hideout',
    what: 'Spend on seasonal rooms for small, capped buffs.',
    terms: [['Room level', 'Each room has a cap; higher levels cost more.']],
    risks: ['Everything here resets next season. Spend for this season, not the next one.'],
    rules: `${RULES}#hideout`,
  },
  alliance: {
    title: 'Alliance',
    what: 'Your alliance: members, the Alliance Wire, announcements and coordination.',
    terms: [['Shared revenge', 'A hit on any member opens revenge for all of you.'], ['Cool-off', 'After leaving, a wait before you can join another alliance.']],
    risks: ['Leaving or being kicked starts a cool-off.'],
    rules: RULES,
  },
  quests: {
    title: 'Jobs',
    what: 'Contacts offer jobs with objectives. Finishing them earns cash, items, reputation and access.',
    terms: [['Contact', 'A character who offers jobs and remembers your reputation.'], ['Tracked job', 'Shown in the tracker while you play.']],
    risks: ['Some jobs expire or lock out other branches.'],
    rules: RULES,
  },
  console: {
    title: 'Console',
    what: 'Private messages, alerts, attacks and your activity history in one place.',
    terms: [['Block', 'No messages either way.'], ['Mute', 'Their messages go straight to Archived, quietly.']],
    risks: ['Never share account details in messages. Report anything abusive.'],
    rules: RULES,
  },
  players: {
    title: 'Players',
    what: 'Find other players by name, crew, pimp number or alliance.',
    terms: [['Activity band', 'Online, recently active, away or offline. Never an exact time.']],
    risks: ['What you see here is public. Recon is still the way to learn what a crew holds.'],
    rules: RULES,
  },
  rankings: {
    title: 'Rankings',
    what: 'National and city standings by net worth, plus the turf board.',
    terms: [['Net worth', 'Cash plus what your crew, gear and product are worth.']],
    risks: ['A high rank makes you a visible target.'],
    rules: `${RULES}#rank`,
  },
  contacts: {
    title: 'Rolodex',
    what: 'Your private contacts and enemies, with notes and what you have legitimately learned.',
    terms: [['Enemy', 'A player you are tracking. Nothing is revealed just because they are listed.']],
    risks: ['Notes are private, but they are only as current as your last recon.'],
    rules: RULES,
  },
};

/** Which help entry a route shows. */
export function pageHelpFor(pathname: string): PageHelp | null {
  const path = pathname.split('?')[0] ?? pathname;
  if (path === '/game') return PAGE_HELP.dashboard!;
  if (path.startsWith('/game/stores')) return PAGE_HELP.stores!;
  if (path === '/game/blocks') return PAGE_HELP.turf!;
  if (path === '/game/cities') return PAGE_HELP.travel!;
  if (path.startsWith('/game/alliances')) return PAGE_HELP.alliance!;
  const key = path.replace(/^\/game\//, '').split('/')[0] ?? '';
  return PAGE_HELP[key] ?? null;
}

export interface GuideStepCopy {
  title: string;
  detail: string;
  to: string;
}

export const GUIDE_STEPS: Record<OnboardingGuideStepKey, GuideStepCopy> = {
  scout: { title: 'Scout the streets', detail: 'Spend some turns working a district.', to: '/game/scout' },
  recruit: { title: 'Recruit your first thug', detail: 'Scouting finds recruits, or hire one at the store.', to: '/game/scout' },
  restock: { title: 'Restock condoms and beer', detail: 'Keep the girls working and the thugs happy.', to: '/game/stores' },
  produce: { title: 'Produce your first product', detail: 'Cook your own instead of buying it.', to: '/game/produce' },
  weapon: { title: 'Buy your first weapon', detail: 'Every thug wants one, and armed thugs cover the street.', to: '/game/stores' },
};
