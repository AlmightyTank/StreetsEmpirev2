import type { ContactCatalog } from '../types.js';

export const questContacts = {
  MAMA_KING: {
    key: 'MAMA_KING',
    name: 'Monique “Mama” King',
    shortName: 'Mama King',
    role: 'Street Operations',
    description: 'An old hand at running the street. Mama teaches the fundamentals: scouting, crew, supplies and keeping a stable productive.',
  },
  PIP: {
    key: 'PIP',
    name: 'Pip',
    shortName: 'Pip',
    role: 'Products & Distribution',
    description: 'Pip moves product and knows where supply is thin. His jobs revolve around production, inventory and distribution.',
  },
  TOMMY: {
    key: 'TOMMY',
    name: 'Tommy',
    shortName: 'Tommy',
    role: 'Weapons & Muscle',
    description: 'Tommy cares about armed crews, intelligence and whether you can handle yourself when a collection turns violent.',
  },
  WHEELS: {
    key: 'WHEELS',
    name: 'Ray “Wheels” Jackson',
    shortName: 'Wheels',
    role: 'Transportation',
    description: 'Wheels knows the roads, the drivers and the routes worth taking. His work opens once your business leaves the home city.',
  },
  VIC: {
    key: 'VIC',
    name: 'Victor “Vic” Moretti',
    shortName: 'Vic',
    role: 'The Fixer',
    description: 'Vic trades in favors, police pressure and problems that disappear when the right person gets paid.',
  },
  BLOCKS: {
    key: 'BLOCKS',
    name: 'Marcus “Blocks” Reed',
    shortName: 'Blocks',
    role: 'Turf Broker',
    description: 'Blocks watches who owns which corners and who is weak enough to lose them. His work begins when you start taking ground.',
  },
} as const satisfies ContactCatalog;
