/**
 * Account-level cosmetic loadouts.
 *
 * One style catalog covers every customizable item: Slice A weapons/rides and
 * Slice B products/supplies. Every non-classic style resolves to its own
 * authored image; CSS color filters are not part of the contract. Crew outfit
 * keys arrive separately in Slice C.
 */
export interface ItemCosmeticStyleDefinition {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly released: boolean;
  /** Easter egg styles: left out of every list until the account owns them. */
  readonly hidden?: boolean;
  /** A style drawn for these items only. Absent: every item and both crew outfits. */
  readonly items?: readonly string[];
}

export const ITEM_COSMETIC_STYLES = [
  {
    key: 'classic',
    label: 'Classic',
    description: 'The original StreetsEmpire artwork.',
    released: true,
  },
  {
    key: 'midnight-ops',
    label: 'Midnight Ops',
    description: 'Blacked-out tactical builds and matte black packaging with teal stencil marks.',
    released: true,
  },
  {
    key: 'urban-ghost',
    label: 'Urban Ghost',
    description: 'Graphite, concrete and pale urban camouflage on hardware and packaging alike.',
    released: true,
  },
  {
    key: 'cartel-gold',
    label: 'Cartel Gold',
    description: 'Engraved metal, polished gold trim and high-roller presentation.',
    released: true,
  },
  {
    key: 'midnight-chrome',
    label: 'Midnight Chrome',
    description: 'Deep graphite, brushed chrome and a narrow crimson accent. A supporter collection for crew and rides.',
    released: true,
  },
  {
    key: 'obsidian-signal-crew',
    label: 'Obsidian Signal',
    description: 'Exclusive Round Roll Call finale: original ice-blue and gold uniforms for both crew types.',
    released: true,
  },
  // The Drop (docs/THE-DROP.md): one style per SKU, bought with Crowns.
  {
    key: 'kingpin-luxe-sedan',
    label: 'Kingpin Luxe',
    description: 'Black lacquer, brass pinstripe and turned-metal wheels. A Drop look for the Sedan.',
    released: true,
    items: ['SEDAN'],
  },
  {
    key: 'kingpin-luxe-thug',
    label: 'Kingpin Luxe',
    description: 'A black double-breasted overcoat with brass cufflinks. A Drop outfit for the Thug.',
    released: true,
  },
  {
    key: 'kingpin-luxe-hoe',
    label: 'Kingpin Luxe',
    description: 'A black satin column gown with brass-chain straps. A Drop outfit for the Hoe.',
    released: true,
  },
  {
    key: 'neon-underworld-low-rider',
    label: 'Neon Underworld',
    description: 'Gunmetal, violet underglow and teal edge lines. A Drop look for the Low-Rider.',
    released: true,
    items: ['LOW_RIDER'],
  },
  {
    key: 'neon-underworld-thug',
    label: 'Neon Underworld',
    description: 'A steel bomber with violet piping and a teal visor. A Drop outfit for the Thug.',
    released: true,
  },
  {
    key: 'neon-underworld-hoe',
    label: 'Neon Underworld',
    description: 'A gunmetal vinyl jacket with a violet lining and teal edge light. A Drop outfit for the Hoe.',
    released: true,
  },
  {
    key: 'neon-underworld-tek9',
    label: 'Neon Underworld',
    description: 'Gunmetal with violet and teal edge lines. A Drop finish for the Tek-9.',
    released: true,
    items: ['TEK9'],
  },
  {
    key: 'winter-heist-van',
    label: 'Winter Heist',
    description: 'Frost-white paint, chained tyres and a snow-loaded roof. A Drop look for the Van.',
    released: true,
    items: ['VAN'],
  },
  {
    key: 'winter-heist-crew',
    label: 'Winter Heist',
    description: 'Padded parkas, knit caps and shearling. A Drop crew set for both crew types.',
    released: true,
  },
  {
    key: 'winter-heist-shotgun',
    label: 'Winter Heist',
    description: 'Frosted steel with a white-wrapped grip. A Drop finish for the shotgun.',
    released: true,
    items: ['SHOTGUN'],
  },
  {
    key: 'biscayne-sunset-sedan',
    label: 'Biscayne Sunset',
    description: 'White paint, a flamingo pinstripe and a teal interior. A Drop look for the Sedan.',
    released: true,
    items: ['SEDAN'],
  },
  {
    key: 'biscayne-sunset-thug',
    label: 'Biscayne Sunset',
    description: 'A white linen suit over a pastel tee. A Drop outfit for the Thug.',
    released: true,
  },
  {
    key: 'biscayne-sunset-hoe',
    label: 'Biscayne Sunset',
    description: 'A teal sequin dress under a palm-print wrap. A Drop outfit for the Hoe.',
    released: true,
  },
  {
    key: 'biscayne-sunset-pistol',
    label: 'Biscayne Sunset',
    description: 'A pearl grip and a flamingo inlay. A Drop finish for the Pistol.',
    released: true,
    items: ['PISTOL'],
  },
  {
    key: 'velvet-speakeasy-sedan',
    label: 'Velvet Speakeasy',
    description: 'Running boards, merlot paint and cream whitewalls. A Drop look for the Sedan.',
    released: true,
    items: ['SEDAN'],
  },
  {
    key: 'velvet-speakeasy-thug',
    label: 'Velvet Speakeasy',
    description: 'A charcoal pinstripe three-piece and a fedora. A Drop outfit for the Thug.',
    released: true,
  },
  {
    key: 'velvet-speakeasy-hoe',
    label: 'Velvet Speakeasy',
    description: 'A beaded cream flapper dress and a feathered headband. A Drop outfit for the Hoe.',
    released: true,
  },
  {
    key: 'velvet-speakeasy-ak47',
    label: 'Velvet Speakeasy',
    description: 'Walnut furniture and a long banana magazine. A Drop finish for the AK-47.',
    released: true,
    items: ['AK47'],
  },
  {
    key: 'platinum-funk-low-rider',
    label: 'Platinum Funk',
    description: 'Chocolate and tangerine, a fur dash and platinum trim. A Drop look for the Low-Rider.',
    released: true,
    items: ['LOW_RIDER'],
  },
  {
    key: 'platinum-funk-thug',
    label: 'Platinum Funk',
    description: 'A wide-lapel tangerine suit and a platinum chain. A Drop outfit for the Thug.',
    released: true,
  },
  {
    key: 'platinum-funk-hoe',
    label: 'Platinum Funk',
    description: 'A white fur coat over a platinum disco jumpsuit. A Drop outfit for the Hoe.',
    released: true,
  },
  {
    key: 'redline-syndicate-sedan',
    label: 'Redline Syndicate',
    description: 'A widebody kit, a carbon wing and red race livery. A Drop look for the Sedan.',
    released: true,
    items: ['SEDAN'],
  },
  {
    key: 'redline-syndicate-thug',
    label: 'Redline Syndicate',
    description: 'A patched carbon racing jacket. A Drop outfit for the Thug.',
    released: true,
  },
  {
    key: 'redline-syndicate-hoe',
    label: 'Redline Syndicate',
    description: 'A red and white pit-crew jumpsuit. A Drop outfit for the Hoe.',
    released: true,
  },
  {
    key: 'redline-syndicate-ak47',
    label: 'Redline Syndicate',
    description: 'Carbon furniture with red trim. A Drop finish for the AK-47.',
    released: true,
    items: ['AK47'],
  },
  {
    key: 'wet-paint-low-rider',
    label: 'Wet Paint',
    description: 'A mural of mint and chrome bubble letters. A Drop look for the Low-Rider.',
    released: true,
    items: ['LOW_RIDER'],
  },
  {
    key: 'wet-paint-thug',
    label: 'Wet Paint',
    description: 'A paint-splattered hoodie and a respirator. A Drop outfit for the Thug.',
    released: true,
  },
  {
    key: 'wet-paint-hoe',
    label: 'Wet Paint',
    description: 'A tagged denim jacket over a mint crop top. A Drop outfit for the Hoe.',
    released: true,
  },
  {
    key: 'wet-paint-pistol',
    label: 'Wet Paint',
    description: 'A mint drip finish over chrome. A Drop finish for the Pistol.',
    released: true,
    items: ['PISTOL'],
  },
  {
    key: 'hazard-cook-van',
    label: 'Hazard Cook',
    description: 'Hazmat yellow, warning stripes and a roof vent stack. A Drop look for the Van.',
    released: true,
    items: ['VAN'],
  },
  {
    key: 'hazard-cook-crew',
    label: 'Hazard Cook',
    description: 'Sealed hazmat suits with respirators. A Drop crew set for both crew types.',
    released: true,
  },
  {
    key: 'hazard-cook-shotgun',
    label: 'Hazard Cook',
    description: 'Stainless steel and hazard tape. A Drop finish for the Shotgun.',
    released: true,
    items: ['SHOTGUN'],
  },
  {
    key: 'dockside-van',
    label: 'Dockside',
    description: 'Container livery, corrugated navy and rust streaks. A Drop look for the Van.',
    released: true,
    items: ['VAN'],
  },
  {
    key: 'dockside-thug',
    label: 'Dockside',
    description: 'A navy peacoat and a watch cap. A Drop outfit for the Thug.',
    released: true,
  },
  {
    key: 'dockside-hoe',
    label: 'Dockside',
    description: 'A safety-orange longshore jacket and overalls. A Drop outfit for the Hoe.',
    released: true,
  },
  {
    key: 'dockside-ak47',
    label: 'Dockside',
    description: 'Salt-pitted steel and rope-wrapped furniture. A Drop finish for the AK-47.',
    released: true,
    items: ['AK47'],
  },
  {
    key: 'crown-jewels-sedan',
    label: 'Crown Jewels',
    description: 'Royal sapphire, a jewelled grille and platinum trim. A Drop look for the Sedan.',
    released: true,
    items: ['SEDAN'],
  },
  {
    key: 'crown-jewels-crew',
    label: 'Crown Jewels',
    description: 'An ermine-collared coat and a ruby-studded gown. A Drop crew set for both crew types.',
    released: true,
  },
  {
    key: 'crown-jewels-ak47',
    label: 'Crown Jewels',
    description: 'Platinum with jewel inlays. A Drop finish for the AK-47.',
    released: true,
    items: ['AK47'],
  },
  {
    key: 'bayou-smoke-van',
    label: 'Bayou Smoke',
    description: 'Moss green, mud, a winch and a roof rack. A Drop look for the Van.',
    released: true,
    items: ['VAN'],
  },
  {
    key: 'bayou-smoke-thug',
    label: 'Bayou Smoke',
    description: 'A waxed field jacket and chest waders. A Drop outfit for the Thug.',
    released: true,
  },
  {
    key: 'bayou-smoke-hoe',
    label: 'Bayou Smoke',
    description: 'A cypress linen dress and gator-hide boots. A Drop outfit for the Hoe.',
    released: true,
  },
  {
    key: 'bayou-smoke-shotgun',
    label: 'Bayou Smoke',
    description: 'Cypress wood and a gator-hide grip. A Drop finish for the Shotgun.',
    released: true,
    items: ['SHOTGUN'],
  },
  {
    key: 'desert-mirage-low-rider',
    label: 'Desert Mirage',
    description: 'Bleached sand, rust fades and turquoise pinstripes. A Drop look for the Low-Rider.',
    released: true,
    items: ['LOW_RIDER'],
  },
  {
    key: 'desert-mirage-thug',
    label: 'Desert Mirage',
    description: 'A sand duster and a turquoise bolo tie. A Drop outfit for the Thug.',
    released: true,
  },
  {
    key: 'desert-mirage-hoe',
    label: 'Desert Mirage',
    description: 'A fringed suede jacket and turquoise jewellery. A Drop outfit for the Hoe.',
    released: true,
  },
  {
    key: 'desert-mirage-tek9',
    label: 'Desert Mirage',
    description: 'Sandblasted with turquoise inlays. A Drop finish for the Tek-9.',
    released: true,
    items: ['TEK9'],
  },
  {
    key: 'rewind-van',
    label: 'Rewind',
    description: 'Black with magenta and lime racing stripes. A Drop look for the Van.',
    released: true,
    items: ['VAN'],
  },
  {
    key: 'rewind-thug',
    label: 'Rewind',
    description: 'A colour-block windbreaker and a cassette chain. A Drop outfit for the Thug.',
    released: true,
  },
  {
    key: 'rewind-hoe',
    label: 'Rewind',
    description: 'A big-shouldered jacket and leg warmers. A Drop outfit for the Hoe.',
    released: true,
  },
  {
    key: 'rewind-tek9',
    label: 'Rewind',
    description: 'Magenta and lime tape stripes. A Drop finish for the Tek-9.',
    released: true,
    items: ['TEK9'],
  },
  {
    key: 'snake-eyes-sedan',
    label: 'Snake Eyes',
    description: 'Felt-green pinstripes, card suits and fuzzy dice. A Drop look for the Sedan.',
    released: true,
    items: ['SEDAN'],
  },
  {
    key: 'snake-eyes-thug',
    label: 'Snake Eyes',
    description: 'A dealer\'s waistcoat and bow tie. A Drop outfit for the Thug.',
    released: true,
  },
  {
    key: 'snake-eyes-hoe',
    label: 'Snake Eyes',
    description: 'A black sequin dress with red card suits. A Drop outfit for the Hoe.',
    released: true,
  },
  {
    key: 'snake-eyes-pistol',
    label: 'Snake Eyes',
    description: 'Ivory dice-pip grips. A Drop finish for the Pistol.',
    released: true,
    items: ['PISTOL'],
  },
  {
    key: 'quarter-mile-sedan',
    label: 'Quarter Mile',
    description: 'Bright orange tuner livery, a big wing and nitrous. A Drop look for the Sedan.',
    released: true,
    items: ['SEDAN'],
  },
  {
    key: 'quarter-mile-low-rider',
    label: 'Quarter Mile',
    description: 'Gloss black with a supercharger through the hood. A Drop look for the Low-Rider.',
    released: true,
    items: ['LOW_RIDER'],
  },
  {
    key: 'quarter-mile-thug',
    label: 'Quarter Mile',
    description: 'A white tank top and a heavy cross chain. A Drop outfit for the Thug.',
    released: true,
  },
  {
    key: 'quarter-mile-hoe',
    label: 'Quarter Mile',
    description: 'A black racing-leather jacket and aviators. A Drop outfit for the Hoe.',
    released: true,
  },
  {
    key: 'quarter-mile-tek9',
    label: 'Quarter Mile',
    description: 'Nitrous blue with racing stripes. A Drop finish for the Tek-9.',
    released: true,
    items: ['TEK9'],
  },
  {
    key: '88-club-van',
    label: '88 Club',
    description: 'A coil-wired lab van with flux glow and fire trails. A Drop look for the Van.',
    released: true,
    items: ['VAN'],
  },
  {
    key: '88-club-thug',
    label: '88 Club',
    description: 'A puffer vest over a denim jacket. A Drop outfit for the Thug.',
    released: true,
  },
  {
    key: '88-club-hoe',
    label: '88 Club',
    description: 'A powder-blue fifties prom dress. A Drop outfit for the Hoe.',
    released: true,
  },
  {
    key: '88-club-pistol',
    label: '88 Club',
    description: 'Chrome with a glowing flux coil. A Drop finish for the Pistol.',
    released: true,
    items: ['PISTOL'],
  },
  {
    key: 'swamp-kingdom-van',
    label: 'Swamp Kingdom',
    description: 'A scaly loch-green van with a big orange roof fin. A Drop look for the Van.',
    released: true,
    items: ['VAN'],
  },
  {
    key: 'swamp-kingdom-thug',
    label: 'Swamp Kingdom',
    description: 'A scaly green jacket with orange fins. A Drop outfit for the Thug.',
    released: true,
  },
  {
    key: 'swamp-kingdom-hoe',
    label: 'Swamp Kingdom',
    description: 'Something funky from the bottom of the loch. A Drop outfit for the Hoe.',
    released: true,
  },
  {
    key: 'swamp-kingdom-shotgun',
    label: 'Swamp Kingdom',
    description: 'A scaly green barrel with a spiny orange fin and barnacles. A Drop finish for the Shotgun.',
    released: true,
    items: ['SHOTGUN'],
  },
  {
    key: 'zombie-apocalypse-van',
    label: 'Zombie Apocalypse',
    description: 'Welded armour, a ram plow and boarded windows. A Drop look for the Van.',
    released: true,
    items: ['VAN'],
  },
  {
    key: 'zombie-apocalypse-thug',
    label: 'Zombie Apocalypse',
    description: 'Torn flannel and a shell bandolier. A Drop outfit for the Thug.',
    released: true,
  },
  {
    key: 'zombie-apocalypse-hoe',
    label: 'Zombie Apocalypse',
    description: 'An olive field jacket with a quarantine armband. A Drop outfit for the Hoe.',
    released: true,
  },
  {
    key: 'zombie-apocalypse-shotgun',
    label: 'Zombie Apocalypse',
    description: 'Duct tape and barbed wire on a pump shotgun. A Drop finish for the Shotgun.',
    released: true,
    items: ['SHOTGUN'],
  },
  // The Drop: Street Singles, one-off pieces for the daily picks.
  {
    key: 'taxi-hustle-sedan',
    label: 'Taxi Hustle',
    description: 'Cab yellow, a checker stripe and a roof light. A Drop look for the Sedan.',
    released: true,
    items: ['SEDAN'],
  },
  {
    key: 'two-tone-classic-sedan',
    label: 'Two-Tone Classic',
    description: 'Cream over teal with chrome trim and whitewalls. A Drop look for the Sedan.',
    released: true,
    items: ['SEDAN'],
  },
  {
    key: 'lime-flake-low-rider',
    label: 'Lime Flake',
    description: 'Candy lime metal flake with gold leaf scrolls. A Drop look for the Low-Rider.',
    released: true,
    items: ['LOW_RIDER'],
  },
  {
    key: 'hot-flames-low-rider',
    label: 'Hot Flames',
    description: 'Gloss black with classic hot-rod flames. A Drop look for the Low-Rider.',
    released: true,
    items: ['LOW_RIDER'],
  },
  {
    key: 'pipe-dreams-van',
    label: 'Pipe Dreams Plumbing',
    description: 'A plumber\'s work van. Totally legitimate business. A Drop look for the Van.',
    released: true,
    items: ['VAN'],
  },
  {
    key: 'flower-power-van',
    label: 'Flower Power',
    description: 'Sky blue with big daisies and a peace of mind. A Drop look for the Van.',
    released: true,
    items: ['VAN'],
  },
  {
    key: 'tiger-stripe-pistol',
    label: 'Tiger Stripe',
    description: 'Orange and black tiger stripes. A Drop finish for the Pistol.',
    released: true,
    items: ['PISTOL'],
  },
  {
    key: 'damascus-ak47',
    label: 'Damascus',
    description: 'Folded Damascus steel with a dark walnut stock. A Drop finish for the AK-47.',
    released: true,
    items: ['AK47'],
  },
  {
    key: 'rust-bucket-shotgun',
    label: 'Rust Bucket',
    description: 'Rust, scratches and duct tape. A Drop finish for the Shotgun.',
    released: true,
    items: ['SHOTGUN'],
  },
  {
    key: 'bubblegum-tek9',
    label: 'Bubblegum',
    description: 'Bubblegum pink with glitter. A Drop finish for the Tek-9.',
    released: true,
    items: ['TEK9'],
  },
  {
    key: 'velour-tracksuit-thug',
    label: 'Velour Tracksuit',
    description: 'A maroon velour tracksuit with gold zips. A Drop outfit for the Thug.',
    released: true,
  },
  {
    key: 'bowling-shirt-thug',
    label: 'Bowling Shirt',
    description: 'A retro two-tone bowling shirt. A Drop outfit for the Thug.',
    released: true,
  },
  {
    key: 'leopard-coat-hoe',
    label: 'Leopard Coat',
    description: 'A leopard-print coat over a black dress. A Drop outfit for the Hoe.',
    released: true,
  },
  {
    key: 'tie-dye-hoe',
    label: 'Tie-Dye',
    description: 'A tie-dye jacket in sunset swirls. A Drop outfit for the Hoe.',
    released: true,
  },
  // The Drop holiday sets: hidden until owned, released by an admin in their season.
  {
    key: 'graveyard-shift-sedan',
    label: 'Graveyard Shift',
    description: 'A hearse conversion with an iron roof rail and lace curtains. A Drop look for the Sedan.',
    released: true,
    hidden: true,
    items: ['SEDAN'],
  },
  {
    key: 'graveyard-shift-thug',
    label: 'Graveyard Shift',
    description: 'An undertaker\'s frock coat and bowler. A Drop outfit for the Thug.',
    released: true,
    hidden: true,
  },
  {
    key: 'graveyard-shift-hoe',
    label: 'Graveyard Shift',
    description: 'A black lace mourning dress and veil. A Drop outfit for the Hoe.',
    released: true,
    hidden: true,
  },
  {
    key: 'graveyard-shift-pistol',
    label: 'Graveyard Shift',
    description: 'A bone-inlay grip and an etched slide. A Drop finish for the Pistol.',
    released: true,
    hidden: true,
    items: ['PISTOL'],
  },
  {
    key: 'naughty-list-van',
    label: 'Naughty List',
    description: 'Candy stripes, a roof bow and a NAUGHTY plate. A Drop look for the Van.',
    released: true,
    hidden: true,
    items: ['VAN'],
  },
  {
    key: 'naughty-list-crew',
    label: 'Naughty List',
    description: 'An ugly-sweater hoodie and a red velvet coat. A Drop crew set for both crew types.',
    released: true,
    hidden: true,
  },
  {
    key: 'naughty-list-tek9',
    label: 'Naughty List',
    description: 'Gift wrap and a ribbon grip. A Drop finish for the Tek-9.',
    released: true,
    hidden: true,
    items: ['TEK9'],
  },
  {
    key: 'heartbreaker-low-rider',
    label: 'Heartbreaker',
    description: 'Candy-apple red and a chain heart wheel. A Drop look for the Low-Rider.',
    released: true,
    hidden: true,
    items: ['LOW_RIDER'],
  },
  {
    key: 'heartbreaker-thug',
    label: 'Heartbreaker',
    description: 'A rose-embroidered black bomber. A Drop outfit for the Thug.',
    released: true,
    hidden: true,
  },
  {
    key: 'heartbreaker-hoe',
    label: 'Heartbreaker',
    description: 'A red satin dress and heart shades. A Drop outfit for the Hoe.',
    released: true,
    hidden: true,
  },
  {
    key: 'heartbreaker-tek9',
    label: 'Heartbreaker',
    description: 'Rose-chrome and an engraved thorn vine. A Drop finish for the Tek-9.',
    released: true,
    hidden: true,
    items: ['TEK9'],
  },
  {
    key: 'block-party-van',
    label: 'Block Party',
    description: 'An ice-cream truck with a roof speaker stack. A Drop look for the Van.',
    released: true,
    hidden: true,
    items: ['VAN'],
  },
  {
    key: 'block-party-thug',
    label: 'Block Party',
    description: 'A sky-blue track jacket and bucket hat. A Drop outfit for the Thug.',
    released: true,
    hidden: true,
  },
  {
    key: 'block-party-hoe',
    label: 'Block Party',
    description: 'A bright two-piece and big hoops. A Drop outfit for the Hoe.',
    released: true,
    hidden: true,
  },
  {
    key: 'block-party-shotgun',
    label: 'Block Party',
    description: 'Sticker-bombed in summer colours. A Drop finish for the Shotgun.',
    released: true,
    hidden: true,
    items: ['SHOTGUN'],
  },
  // Easter eggs (see docs/EASTER-EGGS.md).
  {
    key: 'eight-bit',
    label: '8-Bit',
    description: 'Chunky pixel art straight off the cartridge. Thirty lives not included.',
    released: true,
    hidden: true,
  },
  {
    key: 'time-machine',
    label: 'Time Machine',
    description: 'Brushed stainless, a gull-wing door, a reactor on the back and copper cable down the flank. Sedan only.',
    released: true,
    hidden: true,
    items: ['SEDAN'],
  },
  {
    key: 'holiday-road',
    label: 'Holiday Road Sedan',
    description: 'A wood-paneled holiday wagon carrying a comically oversized Christmas tree. Sedan only.',
    released: true,
    hidden: true,
    items: ['SEDAN'],
  },
  {
    key: 'blue-sky',
    label: 'Blue Sky',
    description: 'Blue glass in a clear bag. 99.1% pure. Meth only.',
    released: true,
    hidden: true,
    items: ['METH'],
  },
] as const satisfies readonly ItemCosmeticStyleDefinition[];

const STYLE_DEFINITIONS = new Map<string, ItemCosmeticStyleDefinition>(ITEM_COSMETIC_STYLES.map((style) => [style.key, style]));

/** Can this item wear this style? Full collections fit everything; single-item styles fit their own items. */
export function styleFitsItem(style: string, item: string): boolean {
  const definition = STYLE_DEFINITIONS.get(style);
  if (!definition) return false;
  return !definition.items || definition.items.includes(item);
}

/** A full collection, which also dresses the crew. */
export function isFullCollectionStyle(style: string): boolean {
  const definition = STYLE_DEFINITIONS.get(style);
  return Boolean(definition && !definition.items);
}

export function isHiddenStyle(style: string): boolean {
  return STYLE_DEFINITIONS.get(style)?.hidden === true;
}

export type ItemCosmeticStyleKey = typeof ITEM_COSMETIC_STYLES[number]['key'];
export const ITEM_COSMETIC_STYLE_KEYS = ITEM_COSMETIC_STYLES.map((style) => style.key) as readonly ItemCosmeticStyleKey[];
export const RELEASED_ITEM_COSMETIC_STYLES = ITEM_COSMETIC_STYLES.filter((style) => style.released);

/** Slice A: weapons and the Low-Rider. */
export const WEAPON_RIDE_COSMETIC_KEYS = [
  'PISTOL',
  'SHOTGUN',
  'TEK9',
  'AK47',
  'LOW_RIDER',
] as const;

/** Slice B: products and Corner Store supplies get redrawn packaging. */
export const PRODUCT_SUPPLY_COSMETIC_KEYS = [
  'CRACK',
  'WEED',
  'ECSTASY',
  'METH',
  'COCAINE',
  'HEROIN',
  'CONDOM',
  'MEDICINE',
  'BEER',
] as const;

/**
 * 1.5.0-F: the Sedan and Van join the rides. Same collections, presentation only: a look never
 * changes cargo, seats, route risk, price or anything else a car does.
 */
export const VEHICLE_COSMETIC_KEYS = [
  'SEDAN',
  'VAN',
] as const;

export const CUSTOMIZABLE_ITEM_KEYS = [
  ...WEAPON_RIDE_COSMETIC_KEYS,
  ...VEHICLE_COSMETIC_KEYS,
  ...PRODUCT_SUPPLY_COSMETIC_KEYS,
] as const;

/** Locker sections, in display order. */
export const ITEM_COSMETIC_GROUPS = [
  { key: 'weapons-rides', label: 'Weapons & rides', items: [...WEAPON_RIDE_COSMETIC_KEYS, ...VEHICLE_COSMETIC_KEYS] },
  { key: 'products-supplies', label: 'Products & supplies', items: PRODUCT_SUPPLY_COSMETIC_KEYS },
] as const;

export type CustomizableItemKey = typeof CUSTOMIZABLE_ITEM_KEYS[number];
export type ItemCosmeticLoadout = Partial<Record<CustomizableItemKey, ItemCosmeticStyleKey>>;

/**
 * Slice C: crew outfit sets. Crew stay aggregate inventory; the loadout picks
 * one authored outfit per crew type from the same collection catalog as items,
 * so a collection's `released` flag and its Street Pass unlock (Slice D) cover
 * items and crew together.
 */
export const CREW_COSMETIC_KEYS = ['THUG', 'HOE'] as const;
export type CrewCosmeticKey = typeof CREW_COSMETIC_KEYS[number];
export const CREW_COSMETIC_STYLE_KEYS = ITEM_COSMETIC_STYLE_KEYS;
export type CrewCosmeticStyleKey = ItemCosmeticStyleKey;

const CREW_OUTFIT_DESCRIPTIONS: Partial<Record<ItemCosmeticStyleKey, string>> = {
  classic: 'The original crew artwork.',
  'midnight-ops': 'Blacked-out night fits: hood up, leather, matte black with teal accents.',
  'urban-ghost': 'Concrete-grey streetwear: camo puffers, beanies and caps, silver chains.',
  'cartel-gold': 'High-roller dress: cream suit and fedora, velvet and fur, heavy gold.',
  'midnight-chrome': 'Charcoal tailoring and brushed chrome: shield shades, racing jacket, tuxedo blazer, the crimson-set chrome diamond.',
  'kingpin-luxe-thug': 'A black double-breasted overcoat, brass cufflinks and a low brim.',
  'kingpin-luxe-hoe': 'A black satin column gown with brass-chain straps and a lacquer clutch.',
  'neon-underworld-thug': 'A steel-grey bomber with violet piping, a teal visor and a reflective hem.',
  'neon-underworld-hoe': 'A gunmetal vinyl jacket with a violet lining, teal edge light and a steel choker.',
  'winter-heist-crew': 'A padded parka and knit cap, and a belted shearling coat with frost on the collar.',
  'biscayne-sunset-thug': 'A white linen suit over a pastel tee, sleeves pushed up, loafers and no socks.',
  'biscayne-sunset-hoe': 'A sea-glass teal sequin dress under a palm-print wrap, with big white sunglasses.',
  'velvet-speakeasy-thug': 'A charcoal pinstripe three-piece, a merlot tie and a pewter-banded fedora.',
  'velvet-speakeasy-hoe': 'A beaded cream flapper dress, a long pearl strand and a feathered headband.',
  'platinum-funk-thug': 'A wide-lapel tangerine suit, a patterned shirt open at the collar and a platinum chain.',
  'platinum-funk-hoe': 'A plush white fur coat over a platinum disco jumpsuit.',
  'redline-syndicate-thug': 'A carbon-black racing jacket covered in sponsor-style patches, with red shoulder stripes.',
  'redline-syndicate-hoe': 'A red and white pit-crew jumpsuit with a headset and fingerless gloves.',
  'wet-paint-thug': 'A paint-splattered black hoodie and a respirator pushed up on the head.',
  'wet-paint-hoe': 'A tagged denim jacket over a mint crop top, with spray-can hoop earrings.',
  'hazard-cook-crew': 'Sealed hazmat suits with respirators and taped gloves for both crew types.',
  'dockside-thug': 'A navy peacoat with the collar up and a ribbed watch cap.',
  'dockside-hoe': 'A safety-orange longshore jacket over navy work overalls and steel-toe boots.',
  'crown-jewels-crew': 'An ermine-collared sapphire coat with a jewelled chain, and a ruby-studded emerald gown with a tiara.',
  'bayou-smoke-thug': 'A waxed moss-green field jacket, chest waders and a gator-tooth necklace.',
  'bayou-smoke-hoe': 'A cypress-brown linen dress, gator-hide boots and a firefly charm bracelet.',
  'desert-mirage-thug': 'A long sand duster, a rust bandana and a turquoise bolo tie.',
  'desert-mirage-hoe': 'A fringed suede jacket over a rust slip dress, with stacked turquoise jewellery.',
  'rewind-thug': 'A colour-block windbreaker in magenta, lime and black, with a cassette on a chain.',
  'rewind-hoe': 'A lime and magenta jacket with big shoulders, leg warmers and a side ponytail.',
  'snake-eyes-thug': 'A dealer\'s waistcoat and bow tie with sleeve garters and a deck in the pocket.',
  'snake-eyes-hoe': 'A black sequin dress with red card suits and a stack of chips in her hand.',
  'quarter-mile-thug': 'A white tank top, a heavy cross chain and dark jeans: dressed for a family cookout after the race.',
  'quarter-mile-hoe': 'A black racing-leather jacket with orange stripes and aviator shades.',
  '88-club-thug': 'An eighties puffer vest over a denim jacket, with a calculator watch.',
  '88-club-hoe': 'A fifties prom dress in powder blue with a corsage and a ribbon in her hair.',
  'swamp-kingdom-thug': 'A jacket in green fish scales, with orange shoulder fins, an orange bandana and a little glass of something creamy on the vest.',
  'swamp-kingdom-hoe': 'A funky little creature from the bottom of the loch: green scales, orange fins, big wet eyes, a lank comb-over and a glass of something creamy.',
  'zombie-apocalypse-thug': 'A torn flannel shirt over a grimy tank, a shell bandolier across the chest and a bloodied bandage on the arm.',
  'zombie-apocalypse-hoe': 'A scuffed olive field jacket with a quarantine-orange armband and a walkie-talkie on the collar.',
  'graveyard-shift-thug': 'An undertaker\'s frock coat, a bowler and a bone-handled cane.',
  'graveyard-shift-hoe': 'A black lace mourning dress with a veil and a ghost-green cameo.',
  'naughty-list-crew': 'An ugly-sweater hoodie with a chain, and a red velvet coat with white trim.',
  'heartbreaker-thug': 'A black bomber embroidered with roses and thorns.',
  'heartbreaker-hoe': 'A red satin dress with heart-shaped shades and a thorned choker.',
  'block-party-thug': 'A sky-blue track jacket and a bucket hat.',
  'block-party-hoe': 'A bright two-piece with big silver hoops and a mango scrunchie.',
  'velour-tracksuit-thug': 'A maroon velour tracksuit with gold zips and white piping.',
  'bowling-shirt-thug': 'A retro two-tone bowling shirt, cream and teal, with a pin stitched on the chest.',
  'leopard-coat-hoe': 'A leopard-print coat over a little black dress.',
  'tie-dye-hoe': 'A tie-dye jacket in sunset swirls over a white tee.',
  'obsidian-signal-crew': 'Midnight graphite tailoring, pale cyan signal visors and gold medal detailing earned only from a completed Roll Call.\n',
  'eight-bit': 'Sixteen colours and a lot of squares.',
};

/** Only full collections dress the crew. */
export const RELEASED_CREW_COSMETIC_STYLES = RELEASED_ITEM_COSMETIC_STYLES
  .filter((style) => isFullCollectionStyle(style.key))
  .map((style) => ({
    key: style.key,
    label: style.label,
    description: CREW_OUTFIT_DESCRIPTIONS[style.key] ?? style.description,
    ...(isHiddenStyle(style.key) ? { hidden: true } : {}),
  }));

export const DEFAULT_CREW_COSMETICS = {
  THUG: 'classic',
  HOE: 'classic',
} as const satisfies Record<CrewCosmeticKey, CrewCosmeticStyleKey>;

export type CrewCosmeticLoadout = Record<CrewCosmeticKey, CrewCosmeticStyleKey>;

/**
 * Collections drawn for only some items and crew. A collection missing from
 * this map covers every customizable item and crew type; one listed here is
 * offered, saved and shown only on the keys it names, so nothing ever falls
 * back to Classic art under another collection's name.
 */
export const COLLECTION_COVERAGE: Partial<Record<ItemCosmeticStyleKey, readonly (CustomizableItemKey | CrewCosmeticKey)[]>> = {
  'midnight-chrome': ['LOW_RIDER', 'SEDAN', 'VAN', 'THUG', 'HOE'],
  'obsidian-signal-crew': ['THUG', 'HOE'],
  'kingpin-luxe-thug': ['THUG'],
  'kingpin-luxe-hoe': ['HOE'],
  'neon-underworld-thug': ['THUG'],
  'neon-underworld-hoe': ['HOE'],
  'winter-heist-crew': ['THUG', 'HOE'],
  'biscayne-sunset-thug': ['THUG'],
  'biscayne-sunset-hoe': ['HOE'],
  'velvet-speakeasy-thug': ['THUG'],
  'velvet-speakeasy-hoe': ['HOE'],
  'platinum-funk-thug': ['THUG'],
  'platinum-funk-hoe': ['HOE'],
  'redline-syndicate-thug': ['THUG'],
  'redline-syndicate-hoe': ['HOE'],
  'wet-paint-thug': ['THUG'],
  'wet-paint-hoe': ['HOE'],
  'hazard-cook-crew': ['THUG', 'HOE'],
  'dockside-thug': ['THUG'],
  'dockside-hoe': ['HOE'],
  'crown-jewels-crew': ['THUG', 'HOE'],
  'bayou-smoke-thug': ['THUG'],
  'bayou-smoke-hoe': ['HOE'],
  'desert-mirage-thug': ['THUG'],
  'desert-mirage-hoe': ['HOE'],
  'rewind-thug': ['THUG'],
  'rewind-hoe': ['HOE'],
  'snake-eyes-thug': ['THUG'],
  'snake-eyes-hoe': ['HOE'],
  'quarter-mile-thug': ['THUG'],
  'quarter-mile-hoe': ['HOE'],
  '88-club-thug': ['THUG'],
  '88-club-hoe': ['HOE'],
  'swamp-kingdom-thug': ['THUG'],
  'swamp-kingdom-hoe': ['HOE'],
  'zombie-apocalypse-thug': ['THUG'],
  'zombie-apocalypse-hoe': ['HOE'],
  'graveyard-shift-thug': ['THUG'],
  'graveyard-shift-hoe': ['HOE'],
  'naughty-list-crew': ['THUG', 'HOE'],
  'heartbreaker-thug': ['THUG'],
  'heartbreaker-hoe': ['HOE'],
  'block-party-thug': ['THUG'],
  'block-party-hoe': ['HOE'],
  'velour-tracksuit-thug': ['THUG'],
  'bowling-shirt-thug': ['THUG'],
  'leopard-coat-hoe': ['HOE'],
  'tie-dye-hoe': ['HOE'],
};

/** Whether a collection has authored art for this item or crew type. Classic always does. */
export function collectionCovers(style: string, key: string): boolean {
  const covered = COLLECTION_COVERAGE[style as ItemCosmeticStyleKey];
  return !covered || (covered as readonly string[]).includes(key);
}

export function isReleasedItemCosmeticStyle(key: string): key is ItemCosmeticStyleKey {
  return RELEASED_ITEM_COSMETIC_STYLES.some((style) => style.key === key);
}

/**
 * Slice D: every non-classic collection is earned (Street Pass), so a player
 * owns Classic plus the collection keys on their account unlocks. The server
 * decides ownership; these helpers keep its options and the web fallback in
 * the same shape.
 */
export const DEFAULT_COLLECTION_UNLOCK_HINT = 'Earned on the Street Pass.';
/** Locked-collection hint for supporter rewards, which are not on any pass. */
export const SUPPORTER_UNLOCK_HINT = 'Supporter reward.';
/** Locked-collection hint for looks sold in The Drop. */
export const DROP_UNLOCK_HINT = 'Sold in The Drop for Crowns.';

export function isOwnedCollection(key: string, owned: ReadonlySet<string>): boolean {
  return key === 'classic' || owned.has(key);
}

export function collectionOptions(
  styles: readonly { key: ItemCosmeticStyleKey; label: string; description: string; hidden?: boolean }[],
  owned: ReadonlySet<string>,
  hints: Partial<Record<ItemCosmeticStyleKey, string>> = {},
): { key: ItemCosmeticStyleKey; label: string; description: string; locked: boolean; unlockHint: string | null }[] {
  // A hidden (Easter egg) style is not offered, or even hinted at, until it is owned.
  return styles.filter((style) => !style.hidden || isOwnedCollection(style.key, owned)).map((style) => {
    const locked = !isOwnedCollection(style.key, owned);
    return {
      key: style.key,
      label: style.label,
      description: style.description,
      locked,
      unlockHint: locked ? hints[style.key] ?? DEFAULT_COLLECTION_UNLOCK_HINT : null,
    };
  });
}
