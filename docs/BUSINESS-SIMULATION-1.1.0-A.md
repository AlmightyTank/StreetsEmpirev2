# Business simulation - 1.1.0-A

Ruleset `classic-og-v1.1-a`: the `classic-og-street-pass-a` balance (0.8.0-H plus Trips
and the Street Pass) plus a `business` block. Run with `npm run qa:business` (add
`-- --output business.md` to write the report). A test pins that nothing but `meta` and
`business` differs from street-pass-a. Moving the base from 0.8.0-H to street-pass-a left
this report unchanged: Trips and the Street Pass do not touch the street economy it prices.

## What is simulated

For the three standard crews (fresh, mid-round, late round), every one of the 120 lots
(40 blocks x 3 lots):

- level-1 and level-5 income a day, with the district's foot traffic and the city signature;
- what the staff cost: a staff thug is a thug not covering girls on the block the holder
  works (the 0.6.0-A turf model, corner crew posted first), a Strip Club takes girls off the
  street, plus the BUSINESS supply job's beer and product;
- build payback (level 1) and full payback (every level to 5);
- for each city, the best fully built home cap (2 blocks, every lot at level 5): gross and
  net income against a street day, and the share of the crew's thugs it ties up.

Deliberately generous to businesses, like 0.6.0-A was to corners: no wars, no shortages,
the register collected daily. The war, fatigue, tier and decay numbers are checked as pure
timings; the fights themselves arrive with 1.1.0-D.

## The gate

- `businessRulesetProblems` is empty: the catalog, lots, signatures, curves and the
  roadmap's decisions (one ally per side, ally cap matched to the declarer, a cut of at most
  50%, girls staff only the Strip Club, torching closed from the Fed sweep, an 8-hour floor
  on the fastest siege) all hold.
- Every lot is worth building for some crew that can hold its block and staff it: build
  payback within 4 days and full payback within 14.
- No single business at level 5 grosses a street day, and a fully built home cap never
  grosses a street day and nets at most half of one after its staff.
- A late crew's fully built home cap ties up at least 5% of its thugs.
- A full Take recovers in 36-72 hours; conceding or defending leaves the block better off
  than a Take; a raider who flips a Stronghold for 36 hours earns under half of a stable
  holder; a captured block earns less over a week than a stable one; a Stronghold takes 2-7
  days; an abandoned level-5 business empties within half a round.

## What the simulation settled

- **Foot traffic.** The first pass failed every Casino-block lot: on the Casino strip a
  thug covers only 4 girls and crews carry none spare, so each staff thug costs a mid crew
  about $4.3k of street income a day. Businesses now earn more on richer blocks
  (`districtIncome`: Casino 1.5, Nightclub 1.25, Low Rent and Urban Ghetto 1.0, Wino Slums
  0.8), and staff counts came down.
- **Casino lots are a late-crew build.** A mid crew's thugs are worth more covering girls
  on the strip than staffing a Casino Front; the mid crew's best businesses are on its
  Nightclub block. Late crews, whose thugs are cheaper per head, get their money back on
  every Casino lot.
- **Businesses supplement the street.** A mid crew's fully built home cap nets 0.32-0.48x a
  street day after staff (and ties up about 42% of its thugs); a late crew's nets about
  0.2x and ties up 8%.
- **The tightest margins.** The Bar on the Casino blocks in Beverly Hills and Las Vegas
  pays back in 3.7-3.9 days against the 4-day limit, and the mid crew's home cap in Miami
  Beach and Seattle nets 0.48x against 0.5x. Any income or staff change has to rerun the
  gate.
- **Wars.** The roadmap's first-pass numbers hold unchanged: 64 fatigue after a full Take
  (36% output, about 51 hours to recover), a raider's 36-hour flip earns 39% of a stable
  holder, a captured Stronghold earns 79% of a stable week, a Stronghold takes 4 days, and
  an abandoned level-5 business is gone in 11 days.

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
