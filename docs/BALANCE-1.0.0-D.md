# Whole-season balance · classic-og-v0.8-h

5 simulated seasons (seeds 1, 2, 3, 4, 5), 28 days each, 30 crews. Medians across seeds.

**Overall: PASS**

| Question | Measure | Value | Line | Result |
| --- | --- | ---: | ---: | --- |
| Does mixed skilled play outperform blind single-system grinding? | Mixed ÷ street-focused, the worse of the two play styles | 1.41 | ≥ 1.1 | pass |
| Does any single system dominate net worth? | Best engaged strategy ÷ mixed | 1 | ≤ 1.5 | pass |
| Can a player ignore combat entirely? | Best never-fighting strategy ÷ best strategy | 0.79 | ≥ 0.7 | pass |
| Can a player ignore the economy entirely? | Pure raider (no street, no trade) ÷ street-focused | 0 | ≤ 0.25 | pass |
| Does controlling turf snowball uncontrollably? | Block changes per block per week (and the best turf crew stays within the dominance band) | 5.38 | ≥ 1 | pass |
| Can established players permanently lock new players out? | Worst late joiner's first week ÷ an opening mixed crew's first week | 0.73 | ≥ 0.5 | pass |
| Are travel profits worth travel risks? | Traveler ÷ street-focused (and hijack losses stay a minority of run income) | 1.23 | ≥ 0.9 | pass |
| Are Hideout upgrades worth their cost? | Hideout investor ÷ street-focused, the worse play style | 1.11 | ≥ 1 | pass |
| Can store arbitrage outperform every other activity? | Strategies store arbitrage beats | 0 | < all | pass |
| Do alliances create unbeatable defensive walls? | Pushes on alliance blocks that land (and a specialist stays within reach of solo mixed play) | 0.92 | ≥ 0.2 | pass |
| Do different strategies win under different circumstances? | Distinct strategies that top a scenario (each seed, each play style) | 2 | ≥ 2 | pass |

## What each band saw

- **mixed-beats-grinding**: engaged $16,387,547 vs $10,554,793; casual $7,103,978 vs $5,030,755
- **no-dominant-system**: top: Mixed player $16,387,547
- **combat-optional**: Traveler $13,009,973 without a single raid, push or tail
- **economy-required**: a crew that only raids ends at $24,871: without an economy it never grows strong enough to hit anyone
- **turf-no-snowball**: most blocks one group held at the end: 1; best turf crew $14,422,904 (0.88× mixed)
- **no-lockout**: Late mixed (day 7): $2,053,187; Late mixed (day 14): $2,095,055; Late mixed (day 21): $1,857,141; opening week $2,541,249
- **travel-worth-it**: hijackers took 12% of what runs would have made; pure trader $2,897,482
- **hideout-pays**: engaged $11,678,170, casual $5,663,266
- **arbitrage-bounded**: store arbitrage ends at $23,871: counters sell far below what they charge, so there is no loop to farm
- **alliances-not-walls**: 156 of 169 pushes on allied blocks landed; alliance specialist 0.85× solo mixed
- **strategies-vary**: Turf holder, Mixed player

## Final standings (median net worth)

| Crew | Strategy | Joined | Net worth |
| --- | --- | ---: | ---: |
| Mixed player (engaged) | Mixed player | day 0 | $16,387,547 |
| Turf holder (engaged) | Turf holder | day 0 | $14,422,904 |
| North turf wing | Turf holder | day 0 | $14,327,302 |
| Alliance specialist (engaged) | Alliance specialist | day 0 | $13,999,750 |
| Convoy hunter (engaged) | Convoy hunter | day 0 | $13,296,835 |
| Traveler (engaged) | Traveler | day 0 | $13,009,973 |
| Raider (engaged) | Raider | day 0 | $12,826,908 |
| Hideout investor (engaged) | Hideout investor | day 0 | $11,678,170 |
| North mixed wing | Mixed player | day 0 | $11,255,533 |
| South raider wing | Raider | day 0 | $11,160,818 |
| Street-focused (engaged) | Street-focused | day 0 | $10,554,793 |
| Late mixed (day 7) | Mixed player | day 7 | $9,692,898 |
| Product producer (engaged) | Product producer | day 0 | $8,747,010 |
| Late street (day 7) | Street-focused | day 7 | $7,926,806 |
| Mixed player (casual) | Mixed player | day 0 | $7,103,978 |
| Turf holder (casual) | Turf holder | day 0 | $6,607,551 |
| Raider (casual) | Raider | day 0 | $6,496,052 |
| Traveler (casual) | Traveler | day 0 | $6,251,722 |
| Convoy hunter (casual) | Convoy hunter | day 0 | $6,186,177 |
| Alliance specialist (casual) | Alliance specialist | day 0 | $6,143,309 |
| Hideout investor (casual) | Hideout investor | day 0 | $5,663,266 |
| Late mixed (day 14) | Mixed player | day 14 | $5,496,032 |
| Street-focused (casual) | Street-focused | day 0 | $5,030,755 |
| Product producer (casual) | Product producer | day 0 | $4,657,512 |
| Trader (engaged) | Trader | day 0 | $2,897,482 |
| Late mixed (day 21) | Mixed player | day 21 | $1,857,141 |
| Trader (casual) | Trader | day 0 | $1,355,148 |
| Pure raider | Raider | day 0 | $24,871 |
| Store arbitrage (engaged) | Store arbitrage | day 0 | $23,871 |
| Store arbitrage (casual) | Store arbitrage | day 0 | $23,533 |

## Where the money came from (first seed)

| Crew | Street | Turf bonus | Turf tax | Back Office | Runs | Raids | Convoys | Lost to raids | Lost to hijacks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Turf holder (engaged) | $16,488,901 | $900,696 | $5,140,142 | $0 | $0 | $0 | $0 | $19,250 | $0 |
| Alliance specialist (engaged) | $16,708,667 | $442,818 | $2,376,851 | $1,585,969 | $0 | $4,546 | $0 | $13,500 | $0 |
| Convoy hunter (engaged) | $19,008,931 | $0 | $0 | $0 | $0 | $0 | $208,205 | $0 | $0 |
| Mixed player (engaged) | $16,700,020 | $561 | $495 | $1,447,971 | $155,681 | $0 | $180,226 | $34,775 | $18,457 |
| Raider (engaged) | $14,713,622 | $0 | $0 | $0 | $0 | $3,585,782 | $0 | $0 | $0 |
| Traveler (engaged) | $16,501,200 | $0 | $0 | $0 | $72,317 | $0 | $0 | $0 | $0 |
| Hideout investor (engaged) | $17,049,433 | $0 | $0 | $1,496,861 | $0 | $0 | $0 | $895,250 | $0 |
| North mixed wing | $14,426,539 | $0 | $0 | $1,339,676 | $201,846 | $0 | $71,443 | $0 | $44,302 |
| South raider wing | $13,047,469 | $0 | $0 | $0 | $0 | $2,995,930 | $0 | $0 | $0 |
| North turf wing | $12,995,361 | $491,998 | $2,870,249 | $0 | $0 | $0 | $0 | $682,750 | $0 |
| Street-focused (engaged) | $17,083,852 | $0 | $0 | $0 | $0 | $0 | $0 | $1,254,750 | $0 |
| Late mixed (day 7) | $11,351,788 | $149,884 | $1,246,825 | $1,004,593 | $219,002 | $0 | $85,671 | $131,422 | $14,726 |
| Product producer (engaged) | $14,471,955 | $0 | $0 | $0 | $0 | $0 | $0 | $1,292,250 | $0 |
| Late street (day 7) | $11,456,505 | $0 | $0 | $0 | $0 | $0 | $0 | $402,750 | $0 |
| Mixed player (casual) | $8,656,078 | $84,095 | $970,953 | $763,946 | $146,906 | $887 | $197,892 | $410,673 | $14,670 |
| Convoy hunter (casual) | $9,760,005 | $0 | $0 | $0 | $0 | $0 | $235,569 | $48,750 | $0 |
| Raider (casual) | $8,040,499 | $0 | $0 | $0 | $0 | $2,085,563 | $0 | $444,000 | $0 |
| Turf holder (casual) | $8,674,162 | $134,971 | $960,606 | $0 | $0 | $0 | $0 | $185,500 | $0 |
| Late mixed (day 14) | $6,238,502 | $185,301 | $1,912,195 | $564,718 | $199,510 | $0 | $139,427 | $376,500 | $21,876 |
| Traveler (casual) | $6,424,342 | $0 | $0 | $0 | $1,824,184 | $0 | $0 | $6,500 | $405,178 |
| Alliance specialist (casual) | $8,730,776 | $57,876 | $423,000 | $770,208 | $0 | $0 | $0 | $955,750 | $0 |
| Hideout investor (casual) | $8,806,886 | $0 | $0 | $766,282 | $0 | $0 | $0 | $654,000 | $0 |
| Street-focused (casual) | $8,826,160 | $0 | $0 | $0 | $0 | $0 | $0 | $415,500 | $0 |
| Product producer (casual) | $7,753,340 | $0 | $0 | $0 | $0 | $0 | $0 | $277,250 | $0 |
| Trader (engaged) | $0 | $0 | $0 | $0 | $4,111,683 | $0 | $0 | $887 | $528,076 |
| Late mixed (day 21) | $2,035,803 | $7,772 | $29,932 | $163,667 | $207,401 | $0 | $17,971 | $171,500 | $15,286 |
| Trader (casual) | $0 | $0 | $0 | $0 | $2,185,631 | $0 | $0 | $242 | $290,275 |
| Pure raider | $0 | $0 | $0 | $0 | $0 | $2,500 | $0 | $1,460 | $0 |
| Store arbitrage (casual) | $0 | $0 | $0 | $0 | $5,440 | $0 | $0 | $0 | $5,753 |
| Store arbitrage (engaged) | $0 | $0 | $0 | $0 | $4,373 | $0 | $0 | $0 | $4,720 |