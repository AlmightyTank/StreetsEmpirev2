# Business simulation - 1.1.0-C

Ruleset `classic-og-v1.1-c`: 1.1.0-B (business building on `classic-og-street-pass-a`) plus
a racket catalog. Run with `npm run qa:business` (add `-- --output business.md` to write the
report). A test pins that nothing but `meta` and `business.rackets` differs from 1.1.0-B, so
every lot, payback and timing number below is unchanged from
[the 1.1.0-A report](BUSINESS-SIMULATION-1.1.0-A.md). What C adds:

## What is simulated

- **Cash rackets on a home cap.** Each crew's best fully built home cap, with every business
  on its best cash racket (Back-room cards, VIP room, Loan sharking, The house always wins;
  a business without one runs its front alone), at full strength: the extra cash a day,
  gross and net against a street day, and the Heat those rackets draw an hour.
- **Laundering.** A crew running both laundering rackets (Casino Front and Laundromat) at
  full strength every hour of a 28-day round, with always more Heat to wash than they can
  take, against the daily and round caps.
- **Every racket's guardrail** (`racketRulesetProblems`): each business has exactly two;
  strength rises with level to 1 at the top; switching costs turns and has a cooldown;
  no racket alone out-heats the hourly cool-down; cash rackets pay at most their front again
  and must draw Heat; and no racket beats the system it hooks:
  - Information network under half of top Lookouts' heads-up (4 minutes);
  - Pillow talk under half of top Lookouts' raid defense (10%);
  - Product storage under half of the top Safe Room's sealed product (100 units);
  - Loose lips always leaves paid recon costing a turn;
  - store rackets shade one store's price by 10% at most, on top of standing;
  - recovery, stop and getaway shares at most a half; cargo at most a quarter;
  - laundering never costs less than 80% of a bribe and never washes more than a full Heat
    bar in a day.

## The gate

On top of 1.1.0-A's gates (which still pass unchanged):

- a home cap on its cash rackets grosses **under 1x** a street day and nets **at most 0.75x**
  after staff, for every crew and city;
- laundering never washes more than the daily cap in a day or the round cap in a round, and
  both rackets together would exceed the daily cap uncapped (so the cap is doing work).

## What the simulation settled

- The first cash shares (cards 0.3, VIP 0.8, loan sharks 0.6, the house 1.0) had a mid-round
  crew's Seattle home cap grossing **1.20x** a street day. They were halved, near enough, to
  **0.15 / 0.35 / 0.3 / 0.45**: the worst home cap now grosses **0.96x** (mid-round, Seattle)
  and nets 0.68x; late in the round it is 0.38x gross.
- Every cash racket on a home cap draws **17 Heat an hour**, against a cool-down of 12: going
  all in on cash rackets climbs toward the drag and bust lines unless the crew launders,
  bribes, or runs Wash & fold.
- Laundering: the two rackets could wash 144 Heat a day; the caps hold a crew to **48 a day**
  and **480 a round**, reached on day 10 of full laundering.

## Report

## Businesses

Every lot at level 1 and level 5, against what its staff would have earned covering girls on the block, for a holder that works its own block 120 turns a day. No wars, no shortages, the register collected daily.

### Fresh start

A street day at home: **$34,424**. Lots in New York City:

| Block | Lot | Business | Hold? | Staff (1/5) | Income/day L1 | Staff cost L1 | Build | Payback | Income/day L5 | Staff cost L5 | All levels | Payback | Street share |
| --- | :-: | --- | :-: | :-: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| CASINO | 1 | Casino Front | no | 2/6 | $11,880 | $16 | $19,800 | 1.7d | $42,768 | $46 | $198,000 | 4.6d | 1.24x |
| CASINO | 2 | Bar | no | 1/3 | $4,500 | $14 | $7,500 | 1.7d | $16,200 | $28 | $75,000 | 4.6d | 0.47x |
| CASINO | 3 | Pawn Shop | no | 1/3 | $4,860 | $14 | $8,100 | 1.7d | $17,496 | $28 | $81,000 | 4.6d | 0.51x |
| NIGHTCLUB | 1 | Nightclub | no | 2/6 | $7,950 | $16 | $15,900 | 2.0d | $28,620 | $46 | $159,000 | 5.6d | 0.83x |
| NIGHTCLUB | 2 | Strip Club | no | 4/12 | $7,500 | $4,574 | $15,000 | 5.1d | $27,000 | $13,722 | $150,000 | 11.3d | 0.78x |
| NIGHTCLUB | 3 | Bar | no | 1/3 | $3,750 | $14 | $7,500 | 2.0d | $13,500 | $28 | $75,000 | 5.6d | 0.39x |
| LOW_RENT | 1 | Laundromat ★ | no | 1/3 | $2,550 | $2,906 | $5,100 | neverd | $9,180 | $2,920 | $51,000 | 8.1d | 0.27x |
| LOW_RENT | 2 | Convenience Store | no | 1/3 | $1,800 | $2,906 | $4,500 | neverd | $6,480 | $2,920 | $45,000 | 12.6d | 0.19x |
| LOW_RENT | 3 | Auto Garage | no | 2/6 | $3,960 | $2,908 | $9,900 | 9.4d | $14,256 | $2,938 | $99,000 | 8.7d | 0.41x |
| URBAN_GHETTO | 1 | Chop Shop | no | 2/6 | $4,440 | $842 | $11,100 | 3.1d | $15,984 | $872 | $111,000 | 7.3d | 0.46x |
| URBAN_GHETTO | 2 | Convenience Store | no | 1/3 | $1,800 | $840 | $4,500 | 4.7d | $6,480 | $854 | $45,000 | 8.0d | 0.19x |
| URBAN_GHETTO | 3 | Warehouse | no | 1/3 | $3,000 | $840 | $7,500 | 3.5d | $10,800 | $854 | $75,000 | 7.5d | 0.31x |
| WINO_SLUMS | 1 | Pawn Shop | no | 1/3 | $2,592 | $14 | $8,100 | 3.1d | $9,331 | $5,536 | $81,000 | 21.3d | 0.27x |
| WINO_SLUMS | 2 | Warehouse | no | 1/3 | $2,400 | $14 | $7,500 | 3.1d | $8,640 | $5,536 | $75,000 | 24.2d | 0.25x |
| WINO_SLUMS | 3 | Laundromat ★ | no | 1/3 | $2,040 | $14 | $5,100 | 2.5d | $7,344 | $5,536 | $51,000 | 28.2d | 0.21x |

This crew cannot take a block off the locals anywhere yet.

### Mid-round

A street day at home: **$213,168**. Lots in New York City:

| Block | Lot | Business | Hold? | Staff (1/5) | Income/day L1 | Staff cost L1 | Build | Payback | Income/day L5 | Staff cost L5 | All levels | Payback | Street share |
| --- | :-: | --- | :-: | :-: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| CASINO | 1 | Casino Front | yes | 2/6 | $11,880 | $8,543 | $19,800 | 5.9d | $42,768 | $25,626 | $198,000 | 11.6d | 0.20x |
| CASINO | 2 | Bar | yes | 1/3 | $4,500 | $4,277 | $7,500 | 33.7d | $16,200 | $12,818 | $75,000 | 22.2d | 0.08x |
| CASINO | 3 | Pawn Shop | yes | 1/3 | $4,860 | $4,277 | $8,100 | 13.9d | $17,496 | $12,818 | $81,000 | 17.3d | 0.08x |
| NIGHTCLUB | 1 | Nightclub | yes | 2/6 | $7,950 | $16 | $15,900 | 2.0d | $28,620 | $46 | $159,000 | 5.6d | 0.13x |
| NIGHTCLUB | 2 | Strip Club | yes | 4/12 | $7,500 | $2,844 | $15,000 | 3.2d | $27,000 | $8,531 | $150,000 | 8.1d | 0.13x |
| NIGHTCLUB | 3 | Bar | yes | 1/3 | $3,750 | $14 | $7,500 | 2.0d | $13,500 | $28 | $75,000 | 5.6d | 0.06x |
| LOW_RENT | 1 | Laundromat ★ | yes | 1/3 | $2,550 | $14 | $5,100 | 2.0d | $9,180 | $28 | $51,000 | 5.6d | 0.04x |
| LOW_RENT | 2 | Convenience Store | yes | 1/3 | $1,800 | $14 | $4,500 | 2.5d | $6,480 | $28 | $45,000 | 7.0d | 0.03x |
| LOW_RENT | 3 | Auto Garage | yes | 2/6 | $3,960 | $16 | $9,900 | 2.5d | $14,256 | $46 | $99,000 | 7.0d | 0.07x |
| URBAN_GHETTO | 1 | Chop Shop | yes | 2/6 | $4,440 | $16 | $11,100 | 2.5d | $15,984 | $46 | $111,000 | 7.0d | 0.07x |
| URBAN_GHETTO | 2 | Convenience Store | yes | 1/3 | $1,800 | $14 | $4,500 | 2.5d | $6,480 | $28 | $45,000 | 7.0d | 0.03x |
| URBAN_GHETTO | 3 | Warehouse | yes | 1/3 | $3,000 | $14 | $7,500 | 2.5d | $10,800 | $28 | $75,000 | 7.0d | 0.05x |
| WINO_SLUMS | 1 | Pawn Shop | yes | 1/3 | $2,592 | $14 | $8,100 | 3.1d | $9,331 | $28 | $81,000 | 8.7d | 0.04x |
| WINO_SLUMS | 2 | Warehouse | yes | 1/3 | $2,400 | $14 | $7,500 | 3.1d | $8,640 | $28 | $75,000 | 8.7d | 0.04x |
| WINO_SLUMS | 3 | Laundromat ★ | yes | 1/3 | $2,040 | $14 | $5,100 | 2.5d | $7,344 | $28 | $51,000 | 7.0d | 0.03x |

A fully built home cap (2 blocks, every lot at level 5), by city:

| City | Blocks | Income/day | Net of staff | Staff | Gross / street | Net / street | Thugs used |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| New York City | CASINO, NIGHTCLUB | $145,584 | $85,716 | 33 | 0.68x | 0.40x | 42% |
| Detroit | CASINO, NIGHTCLUB | $145,584 | $86,585 | 33 | 0.68x | 0.41x | 42% |
| Miami Beach | CASINO, NIGHTCLUB | $152,739 | $96,197 | 33 | 0.75x | 0.48x | 42% |
| Seattle | CASINO, NIGHTCLUB | $145,584 | $91,510 | 33 | 0.76x | 0.48x | 42% |
| Beverly Hills | CASINO, NIGHTCLUB | $149,958 | $80,626 | 33 | 0.59x | 0.32x | 42% |
| Las Vegas | CASINO, NIGHTCLUB | $156,276 | $89,502 | 33 | 0.64x | 0.37x | 42% |
| Los Angeles | CASINO, NIGHTCLUB | $145,584 | $86,484 | 33 | 0.68x | 0.41x | 42% |
| Atlanta | CASINO, NIGHTCLUB | $152,334 | $93,234 | 33 | 0.71x | 0.44x | 42% |

The same home caps with every business on its best cash racket (1.1.0-C):

| City | Racket cash/day | Gross / street | Net / street | Racket Heat/hour |
| --- | ---: | ---: | ---: | ---: |
| New York City | $38,399 | 0.86x | 0.58x | 17.0 |
| Detroit | $38,399 | 0.86x | 0.59x | 17.0 |
| Miami Beach | $38,399 | 0.94x | 0.66x | 17.0 |
| Seattle | $38,399 | 0.96x | 0.68x | 17.0 |
| Beverly Hills | $39,711 | 0.74x | 0.47x | 17.0 |
| Las Vegas | $43,211 | 0.81x | 0.54x | 17.0 |
| Los Angeles | $38,399 | 0.86x | 0.59x | 17.0 |
| Atlanta | $40,762 | 0.91x | 0.63x | 17.0 |

### Late round

A street day at home: **$538,304**. Lots in New York City:

| Block | Lot | Business | Hold? | Staff (1/5) | Income/day L1 | Staff cost L1 | Build | Payback | Income/day L5 | Staff cost L5 | All levels | Payback | Street share |
| --- | :-: | --- | :-: | :-: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| CASINO | 1 | Casino Front | yes | 2/6 | $11,880 | $4,322 | $19,800 | 2.6d | $42,768 | $12,965 | $198,000 | 6.6d | 0.08x |
| CASINO | 2 | Bar | yes | 1/3 | $4,500 | $2,167 | $7,500 | 3.2d | $16,200 | $6,488 | $75,000 | 7.7d | 0.03x |
| CASINO | 3 | Pawn Shop | yes | 1/3 | $4,860 | $2,167 | $8,100 | 3.0d | $17,496 | $6,488 | $81,000 | 7.4d | 0.03x |
| NIGHTCLUB | 1 | Nightclub | yes | 2/6 | $7,950 | $16 | $15,900 | 2.0d | $28,620 | $46 | $159,000 | 5.6d | 0.05x |
| NIGHTCLUB | 2 | Strip Club | yes | 4/12 | $7,500 | $1,451 | $15,000 | 2.5d | $27,000 | $4,353 | $150,000 | 6.6d | 0.05x |
| NIGHTCLUB | 3 | Bar | yes | 1/3 | $3,750 | $14 | $7,500 | 2.0d | $13,500 | $28 | $75,000 | 5.6d | 0.03x |
| LOW_RENT | 1 | Laundromat ★ | yes | 1/3 | $2,550 | $14 | $5,100 | 2.0d | $9,180 | $28 | $51,000 | 5.6d | 0.02x |
| LOW_RENT | 2 | Convenience Store | yes | 1/3 | $1,800 | $14 | $4,500 | 2.5d | $6,480 | $28 | $45,000 | 7.0d | 0.01x |
| LOW_RENT | 3 | Auto Garage | yes | 2/6 | $3,960 | $16 | $9,900 | 2.5d | $14,256 | $46 | $99,000 | 7.0d | 0.03x |
| URBAN_GHETTO | 1 | Chop Shop | yes | 2/6 | $4,440 | $16 | $11,100 | 2.5d | $15,984 | $46 | $111,000 | 7.0d | 0.03x |
| URBAN_GHETTO | 2 | Convenience Store | yes | 1/3 | $1,800 | $14 | $4,500 | 2.5d | $6,480 | $28 | $45,000 | 7.0d | 0.01x |
| URBAN_GHETTO | 3 | Warehouse | yes | 1/3 | $3,000 | $14 | $7,500 | 2.5d | $10,800 | $28 | $75,000 | 7.0d | 0.02x |
| WINO_SLUMS | 1 | Pawn Shop | yes | 1/3 | $2,592 | $14 | $8,100 | 3.1d | $9,331 | $28 | $81,000 | 8.7d | 0.02x |
| WINO_SLUMS | 2 | Warehouse | yes | 1/3 | $2,400 | $14 | $7,500 | 3.1d | $8,640 | $28 | $75,000 | 8.7d | 0.02x |
| WINO_SLUMS | 3 | Laundromat ★ | yes | 1/3 | $2,040 | $14 | $5,100 | 2.5d | $7,344 | $28 | $51,000 | 7.0d | 0.01x |

A fully built home cap (2 blocks, every lot at level 5), by city:

| City | Blocks | Income/day | Net of staff | Staff | Gross / street | Net / street | Thugs used |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| New York City | CASINO, NIGHTCLUB | $145,584 | $115,216 | 33 | 0.27x | 0.21x | 8% |
| Detroit | CASINO, NIGHTCLUB | $145,584 | $115,704 | 33 | 0.27x | 0.21x | 8% |
| Miami Beach | CASINO, NIGHTCLUB | $152,739 | $124,051 | 33 | 0.30x | 0.24x | 8% |
| Seattle | CASINO, NIGHTCLUB | $145,584 | $118,098 | 33 | 0.30x | 0.24x | 8% |
| Beverly Hills | CASINO, NIGHTCLUB | $149,958 | $114,810 | 33 | 0.23x | 0.18x | 8% |
| Las Vegas | CASINO, NIGHTCLUB | $156,276 | $122,420 | 33 | 0.25x | 0.20x | 8% |
| Los Angeles | CASINO, NIGHTCLUB | $145,584 | $115,604 | 33 | 0.27x | 0.21x | 8% |
| Atlanta | CASINO, NIGHTCLUB | $152,334 | $122,354 | 33 | 0.28x | 0.23x | 8% |

The same home caps with every business on its best cash racket (1.1.0-C):

| City | Racket cash/day | Gross / street | Net / street | Racket Heat/hour |
| --- | ---: | ---: | ---: | ---: |
| New York City | $38,399 | 0.34x | 0.29x | 17.0 |
| Detroit | $38,399 | 0.34x | 0.29x | 17.0 |
| Miami Beach | $38,399 | 0.37x | 0.32x | 17.0 |
| Seattle | $38,399 | 0.38x | 0.32x | 17.0 |
| Beverly Hills | $39,711 | 0.29x | 0.24x | 17.0 |
| Las Vegas | $43,211 | 0.32x | 0.27x | 17.0 |
| Los Angeles | $38,399 | 0.34x | 0.29x | 17.0 |
| Atlanta | $40,762 | 0.36x | 0.30x | 17.0 |

### City signatures

Each city's signature business at level 5, for the mid-round crew.

| City | Signature | Block | Income/day L5 | Payback (all levels) |
| --- | --- | --- | ---: | ---: |
| New York City | Laundromat | LOW_RENT lot 1 | $9,180 | 5.6d |
| New York City | Laundromat | WINO_SLUMS lot 3 | $7,344 | 7.0d |
| Detroit | Chop Shop | URBAN_GHETTO lot 1 | $19,980 | 5.6d |
| Miami Beach | Nightclub | NIGHTCLUB lot 1 | $35,775 | 4.5d |
| Seattle | Warehouse | URBAN_GHETTO lot 3 | $13,500 | 5.6d |
| Seattle | Warehouse | WINO_SLUMS lot 2 | $10,800 | 7.0d |
| Beverly Hills | Pawn Shop | CASINO lot 3 | $21,870 | 12.5d |
| Beverly Hills | Pawn Shop | WINO_SLUMS lot 1 | $11,664 | 7.0d |
| Las Vegas | Casino Front | CASINO lot 1 | $53,460 | 8.3d |
| Los Angeles | Auto Garage | LOW_RENT lot 3 | $17,820 | 5.6d |
| Atlanta | Strip Club | NIGHTCLUB lot 2 | $33,750 | 5.8d |

### Rackets

Each racket at full strength (top level, fully staffed). Heat cools 12 points an hour on its own.

| Business | Racket | Effect | Heat/hour |
| --- | --- | --- | ---: |
| Nightclub | Ecstasy demand | The dance floor wants pills: Pip pays more for your ecstasy. | 1 |
| Nightclub | Information network | Bouncers and regulars talk: earlier sightings of pushes on your blocks and tails on your runs. | 0 |
| Bar | Back-room cards | A quiet game in the back: a little extra cash, very little Heat. | 1 |
| Bar | Loose lips | Drinkers talk: recon on crews in your city costs a turn less. | 0 |
| Strip Club | VIP room | Private dances for big spenders: high cash, high Heat. | 5 |
| Strip Club | Pillow talk | The girls hear who is coming: extra home raid defense. | 1 |
| Chop Shop | Stolen Low-Riders | Hot cars with new plates: Charlie sells you Low-Riders cheaper. | 2 |
| Chop Shop | Vehicle recovery | The shop knows every chop in town: a Low-Rider a convoy hit would take may come back. | 1 |
| Pawn Shop | Fencing | No questions asked: Tommy pays more for the guns you sell back. | 2 |
| Pawn Shop | Loan sharking | Cash out the back at bad rates: good money into the register, and Heat. | 3 |
| Auto Garage | Run mods | Hidden compartments and clean plates: fewer police stops on runs out of town. | 0 |
| Auto Garage | Getaway cars | A car waiting round the corner: a beaten push squad takes fewer wounds getting home. | 1 |
| Convenience Store | Beer supply | Cases off the back of the truck: cheaper beer at the Corner Store. | 0 |
| Convenience Store | Counter sales | Product under the counter: a little sells every hour at Pip’s price, no street turns. | 2 |
| Warehouse | Product storage | A locked cage in the back: more product sealed away from raids, on top of the Safe Room. | 1 |
| Warehouse | Shipment capacity | Crates packed tight: bigger loads on runs out of town. | 1 |
| Casino Front | The house always wins | Rigged tables: big cash, big Heat. | 7 |
| Casino Front | Laundering | Run dirty money through the cage: washes Heat off every hour, paid from the register. | 0 |
| Laundromat | Laundering | Quarters in, clean bills out: washes a little Heat off every hour, paid from the register. | 0 |
| Laundromat | Wash & fold | Clean books for the whole block: your other rackets draw less Heat. | 0 |

- **Laundering:** both laundering rackets at full strength would wash 144 Heat a day; the caps hold them to **48** a day and **480** a round (the round cap is reached on day 10).
- **Switching** a racket costs 2 turns and then locks for 12 hours.

### Block wars and war fatigue

A siege takes **12.0 hours** alone and **8.0 hours** with an ally at the full cap. Output is 100% minus fatigue.

| Outcome | Fatigue | Output right after | Back to 100% in |
| --- | ---: | ---: | ---: |
| Full siege, then Take | 64 | 36% | 51 hours |
| Holder concedes halfway through the siege | 37 | 63% | 30 hours |
| Holder breaks the siege halfway and wins | 32 | 68% | 26 hours |
| Full siege, then Sack | 74 | 26% | 59 hours |
| Fought over again a day after a Take | 80 | 20% | 64 hours |

- **Flipping:** a raider who keeps a captured Stronghold for 36 hours earns **39%** of what a stable holder makes from it (fatigue, plus the block dropping to Established).
- **A week after a Take**, the captor earns **79%** of a stable week, and the block is a Stronghold again after 72 hours.
- **Pace:** a Stronghold takes **4.0 days** of holding; an abandoned level-5 business is gone after **11.0 days** under the locals.
