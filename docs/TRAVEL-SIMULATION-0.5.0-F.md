# Travel simulation - 0.5.0-F

Ruleset `classic-og-v0.5-f`. One run from New York City: drive to the buy city, load up, drive to the sell city, sell, drive home, on the shortest roads. 0.5 turns per drive hour, 750 units per Low-Rider, Pip's usual supply, the high market from its baseline with its depth, no road stops and no hijackers.

Street work is the same crew on the best block its thugs can cover, at 85% happiness, the busiest clients and a 50% payout. Both are counted as net worth, the number rankings use: cash at 75%, and the whores and thugs a trip recruits at their net worth. Each run carries the load that earns the most: past that, one more unit sells for less than it costs.

## Fresh start

20 whores, 5 thugs, 1 Low-Rider (750 units), $20,000. Street work: $409 of net worth a turn in the Wino Slums ($52 of it cash).

| Run | Units | Held by | Profit | Drive | Turns | Cash per turn | Of street |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| COCAINE from Miami Beach (market) to Beverly Hills (market) | 750 | trunk | $24,316 | 104h | 52 | $468 | 86% |
| COCAINE from Miami Beach (market) to Las Vegas (market) | 750 | trunk | $17,858 | 103h | 52 | $343 | 63% |
| HEROIN from Atlanta (market) to Detroit (market) | 750 | trunk | $5,657 | 34h | 17 | $333 | 61% |
| COCAINE from Miami Beach (market) to Detroit (market) | 750 | trunk | $5,196 | 50h | 25 | $208 | 38% |
| ECSTASY from Seattle (market) to Las Vegas (market) | 750 | trunk | $9,728 | 103h | 52 | $187 | 34% |
| ECSTASY from Seattle (market) to Miami Beach (market) | 750 | trunk | $9,812 | 116h | 58 | $169 | 31% |
| COCAINE from New York City (market) to Beverly Hills (market) | 475 | cash | $6,685 | 87h | 44 | $152 | 28% |
| COCAINE from Los Angeles (market) to Beverly Hills (market) | 474 | cash | $6,652 | 87h | 44 | $151 | 28% |

## Mid-round

200 whores, 50 thugs, 5 Low-Riders (3750 units), $300,000. Street work: $2,270 of net worth a turn in the Casino District ($2,974 of it cash).

| Run | Units | Held by | Profit | Drive | Turns | Cash per turn | Of street |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| COCAINE from Miami Beach (market) to Beverly Hills (market) | 3750 | trunk | $99,377 | 104h | 52 | $1,911 | 63% |
| COCAINE from Miami Beach (market) to Las Vegas (market) | 3750 | trunk | $80,446 | 103h | 52 | $1,547 | 51% |
| HEROIN from Atlanta (market) to Detroit (market) | 3750 | trunk | $25,466 | 34h | 17 | $1,498 | 49% |
| COCAINE from Miami Beach (market) to Detroit (market) | 3750 | trunk | $20,395 | 50h | 25 | $816 | 27% |
| ECSTASY from Seattle (market) to Las Vegas (market) | 3750 | trunk | $39,497 | 103h | 52 | $760 | 25% |
| ECSTASY from Seattle (market) to Miami Beach (market) | 3750 | trunk | $41,584 | 116h | 58 | $717 | 24% |
| COCAINE from New York City (market) to Beverly Hills (market) | 3750 | trunk | $28,748 | 87h | 44 | $653 | 22% |
| COCAINE from Los Angeles (market) to Beverly Hills (market) | 3668 | market | $27,531 | 87h | 44 | $626 | 21% |

## Late round

1000 whores, 250 thugs, 20 Low-Riders (15000 units), $3,000,000. Street work: $8,189 of net worth a turn in the Casino District ($10,906 of it cash).

| Run | Units | Held by | Profit | Drive | Turns | Cash per turn | Of street |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| COCAINE from Miami Beach (market) to Las Vegas (market) | 15000 | trunk | $189,106 | 103h | 52 | $3,637 | 33% |
| HEROIN from Atlanta (market) to Detroit (market) | 15000 | trunk | $59,591 | 34h | 17 | $3,505 | 32% |
| COCAINE from Miami Beach (market) to Beverly Hills (market) | 8586 | market | $145,579 | 104h | 52 | $2,800 | 26% |
| METH from Los Angeles (market) to Atlanta (market) | 15000 | trunk | $66,898 | 87h | 44 | $1,520 | 14% |
| ECSTASY from Seattle (market) to Miami Beach (market) | 10214 | market | $69,397 | 116h | 58 | $1,197 | 11% |
| ECSTASY from Seattle (market) to Las Vegas (market) | 8347 | market | $56,724 | 103h | 52 | $1,091 | 10% |
| COCAINE from Miami Beach (market) to Detroit (market) | 7344 | market | $26,836 | 50h | 25 | $1,073 | 10% |
| WEED from Seattle (market) to Los Angeles (market) | 15000 | trunk | $47,936 | 103h | 52 | $922 | 8% |

## A reason to go

The best run through each city, buying or selling there, for the mid-round crew. The gate asks for 15% of street work a turn outside the starting city.

| City | Best run, of street |
| --- | ---: |
| New York City | 22% |
| Detroit | 49% |
| Miami Beach | 63% |
| Seattle | 25% |
| Beverly Hills | 63% |
| Las Vegas | 51% |
| Los Angeles | 21% |
| Atlanta | 49% |

## Gate

- Passes: no run beats the street for any crew, every city has a reason to go, and no city makes a same-city loop.

# Travel risk simulation - 0.5.0-F

Ruleset `classic-og-v0.5-f`. Each crew's best planned runs from the 0.5.0-A simulation, driven 400 times each through live rounds: a different seeded round and departure time every time, starting Heat anywhere from 0 to 60, every escort the cars seat, and the plan's cost and a tenth more in cash. Pip's supply swings, gluts and droughts, the high market at the schedule's price, police stops on every leg, the towns' busts and arrests, and Heat from selling all apply. The runner skips a buy that already costs more than they planned to sell for, and nothing else.

The gate: the average stays within 75%-110% of the plan; the best plan's 10th percentile is at most 85% of it and its 90th at least 110%; no run averages more than the street; and nobody can pump a high market and cash it out.

## Fresh start

Street work: $409 of net worth a turn.

| Run | Plan | Average | 10th | Median | 90th | Stopped | Busted | Moved | Skipped | Of street |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| COCAINE from Miami Beach (market) to Beverly Hills (market) | $24,316 | $20,968 | $11,232 | $21,683 | $27,687 | 16% | 1% | 43% | 0% | 74% |
| COCAINE from Miami Beach (market) to Las Vegas (market) | $17,858 | $16,042 | $6,451 | $15,400 | $24,223 | 17% | 0% | 60% | 0% | 57% |
| HEROIN from Atlanta (market) to Detroit (market) | $5,657 | $5,293 | $3,401 | $5,327 | $6,734 | 3% | 0% | 35% | 0% | 57% |
| COCAINE from Miami Beach (market) to Detroit (market) | $5,196 | $3,947 | $0 | $3,964 | $7,309 | 9% | 1% | 47% | 7% | 29% |
| ECSTASY from Seattle (market) to Las Vegas (market) | $9,728 | $9,204 | $2,530 | $8,671 | $14,882 | 14% | 0% | 56% | 1% | 32% |

## Mid-round

Street work: $2,270 of net worth a turn.

| Run | Plan | Average | 10th | Median | 90th | Stopped | Busted | Moved | Skipped | Of street |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| COCAINE from Miami Beach (market) to Beverly Hills (market) | $99,377 | $83,063 | $35,865 | $87,180 | $115,646 | 15% | 2% | 41% | 0% | 53% |
| COCAINE from Miami Beach (market) to Las Vegas (market) | $80,446 | $71,889 | $25,798 | $67,840 | $113,067 | 16% | 0% | 63% | 0% | 46% |
| HEROIN from Atlanta (market) to Detroit (market) | $25,466 | $23,013 | $13,204 | $23,830 | $30,551 | 6% | 0% | 34% | 0% | 45% |
| COCAINE from Miami Beach (market) to Detroit (market) | $20,395 | $15,876 | -$1,723 | $17,165 | $30,674 | 8% | 1% | 42% | 6% | 21% |
| ECSTASY from Seattle (market) to Las Vegas (market) | $39,497 | $37,825 | $7,247 | $36,380 | $64,596 | 10% | 0% | 57% | 2% | 24% |

## Late round

Street work: $8,189 of net worth a turn.

| Run | Plan | Average | 10th | Median | 90th | Stopped | Busted | Moved | Skipped | Of street |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| COCAINE from Miami Beach (market) to Las Vegas (market) | $189,106 | $164,346 | $14,222 | $148,641 | $309,921 | 20% | 0% | 63% | 1% | 29% |
| HEROIN from Atlanta (market) to Detroit (market) | $59,591 | $53,366 | $22,819 | $53,908 | $77,770 | 5% | 0% | 39% | 1% | 29% |
| COCAINE from Miami Beach (market) to Beverly Hills (market) | $145,579 | $132,503 | $65,861 | $131,439 | $178,342 | 16% | 0% | 43% | 1% | 23% |
| METH from Los Angeles (market) to Atlanta (market) | $66,898 | $60,625 | $21,854 | $60,006 | $85,685 | 14% | 0% | 34% | 1% | 13% |
| ECSTASY from Seattle (market) to Miami Beach (market) | $69,397 | $58,977 | -$6,388 | $59,913 | $121,167 | 12% | 0% | 44% | 1% | 9% |

## Gate

- Passes: wide outcomes, the average holds, no run beats the street, and no market can be pumped.

# Where to live - 0.5.0-F

Street work per turn living in each city, against New York City, on the best block the crew can cover. The Heat lines are listed because they are part of what the better blocks cost; so are Pip's home prices, which follow each city's character.

| City | Busts from | Arrests from | Fresh start | Mid-round | Late round |
| --- | ---: | ---: | ---: | ---: | ---: |
| New York City | 70 | 90 | 100% (Wino Slums) | 100% (Casino District) | 100% (Casino District) |
| Detroit | 78 | 92 | 100% (Wino Slums) | 100% (Casino District) | 100% (Casino District) |
| Miami Beach | 55 | 75 | 100% (Wino Slums) | 95% (Casino District) | 95% (Casino District) |
| Seattle | 80 | 95 | 100% (Wino Slums) | 90% (Casino District) | 90% (Casino District) |
| Beverly Hills | 45 | 65 | 104% (Casino District) | 120% (Casino District) | 120% (Casino District) |
| Las Vegas | 75 | 82 | 101% (Casino District) | 115% (Casino District) | 115% (Casino District) |
| Los Angeles | 70 | 88 | 100% (Wino Slums) | 100% (Casino District) | 100% (Casino District) |
| Atlanta | 85 | 97 | 100% (Wino Slums) | 100% (Casino District) | 100% (Casino District) |

# Convoy simulation - 0.5.0-F

Ruleset `classic-og-v0.5-f`. A tail landing on a run, fought 2000 times on the raid engine with the road's strength roll (defense x1, variance 30%): the attacker's squad against the escorts and any backup that reaches them, every thug with a pistol, at 85% morale. Home backup is 50% of the owner's fit thugs at home in the home town, falling to none at the edge of the home zone.

| Scenario | Attackers | Defenders | Attacker wins | Band |
| --- | ---: | ---: | ---: | ---: |
| Rival runs, two cars each | 12 | 12 | 49% | 25%-55% |
| A local squad on a full escort, far from home | 30 | 30 | 52% | 25%-55% |
| A local squad on a light escort | 30 | 6 | 100% | 75%-100% |
| A local squad on an average escort | 30 | 12 | 100% | 75%-100% |
| The same, with the owner sending 20 from home | 30 | 32 | 44% | 2%-50% |
| The same, halfway into its home zone | 30 | 27 | 65% | 10%-75% |
| The same, at the edge of its home town | 30 | 42 | 10% | 2%-35% |
| A big squad at the edge of a big crew's home town | 80 | 130 | 20% | 2%-35% |

## Gate

- Passes: even fights are fights, light escorts are prey, a run at home is hard to take but not untouchable, and backup changes the odds.

# Full round with travel - 0.5.0-F

Ruleset `classic-og-v0.5-f`. 28 days, as expected values. Every strategy is played from New York and from each other city, moving there as soon as the fee is half the cash on hand. The street earns the average block (client capacity is hidden and reshuffled hourly), at 85% happiness and a 50% cut, and buys product at the home Pip's when it earns more than it costs. Runs are planned from the crew's cash, cars and home, driven in real time one at a time, and kept at their C risk-model average (swings, events, stops, busts); a supply run brings home the street's best product. Produce cooks what the shelves cannot supply when a turn at the stove beats a turn on the street, up to 30% of a session.

The rest of the round is assumed: a recon finds a run worth tailing 30% of the time, a hijacker lands at most 4 hits a day playing all day and 1 a session twice a day, the run it finds carries $330,000 out and 1900 Cocaine back with 12 escorts, and 10% of your own runs are tailed by a squad of 30.

Score is net worth as rankings count it: cash at its weight, whores, thugs, Low-Riders and the stash.

## Gate

**Passes.** In every play style, start and home, mixed play beats the street alone, the street with Produce, and running alone.

## All day · Fresh start

576 turns a day at the regeneration pace, online sixteen hours: runs go back to back. 20 whores, 5 thugs, 1 Low-Rider, $20,000.

| Home | Street only | Street and Produce | Runner only | Hijacker | Mixed, runs for profit | Mixed, supply runs | Mixed, either run | Moved on day |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| New York City | $26,868,762 | $26,868,762 | $2,896,958 | $25,158,851 | **$27,242,275** | $26,785,628 | $26,932,501 | - |
| Detroit | $21,935,905 | $21,935,905 | $5,886,176 | $22,076,373 | $23,749,925 | $25,287,493 | **$25,375,153** | 2 |
| Miami Beach | $24,794,218 | $24,794,218 | $6,327,863 | $23,102,757 | $24,882,901 | $24,794,218 | **$25,020,002** | 2 |
| Seattle | $25,573,074 | $25,573,074 | $5,026,173 | $23,835,810 | **$26,026,882** | $25,040,329 | $25,532,181 | 2 |
| Beverly Hills | $30,260,653 | $30,260,653 | $6,030,272 | $29,046,288 | $30,269,739 | $31,038,059 | **$31,063,265** | 2 |
| Las Vegas | $24,807,562 | $24,807,562 | $3,662,952 | $24,930,681 | $25,107,641 | **$29,306,726** | $29,304,067 | 2 |
| Los Angeles | $26,821,041 | $26,821,041 | $6,488,751 | $25,120,131 | **$27,252,376** | $26,717,460 | $27,237,544 | 2 |
| Atlanta | $24,462,268 | $24,462,268 | $7,540,287 | $23,947,327 | $26,671,731 | $26,575,539 | **$27,234,815** | 2 |

From New York City:

| Strategy | Score | Cash | Whores | Thugs | Cars | Street | Produce | Runs (supply) | Run turns | Run profit | Hits | Hit take | Average Heat | Idle turns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Street only | $26,868,762 | $34,748,587 | 352 | 134 | 1 | 16,128 | 0 | 0 (0) | 0 | $0 | 0.0 | $0 | 23 | 0 |
| Street and Produce | $26,868,762 | $34,748,587 | 352 | 134 | 1 | 16,128 | 0 | 0 (0) | 0 | $0 | 0.0 | $0 | 23 | 0 |
| Runner only | $2,896,958 | $3,788,277 | 20 | 5 | 4 | 0 | 0 | 58 (0) | 2,913 | $3,783,277 | 0.0 | $0 | 0 | 13,215 |
| Hijacker | $25,158,851 | $32,536,696 | 329 | 126 | 1 | 14,535 | 0 | 0 (0) | 0 | $0 | 107.7 | $1,354,449 | 31 | 0 |
| Mixed, runs for profit | $27,242,275 | $35,230,147 | 327 | 122 | 25 | 13,806 | 0 | 81 (0) | 2,322 | $7,406,413 | 0.0 | $0 | 35 | 0 |
| Mixed, supply runs | $26,785,628 | $34,481,672 | 346 | 132 | 13 | 15,862 | 0 | 14 (14) | 266 | $0 | 0.0 | $0 | 32 | 0 |
| Mixed, either run | $26,932,501 | $34,659,186 | 326 | 122 | 25 | 13,868 | 0 | 82 (13) | 2,260 | $6,361,302 | 0.0 | $0 | 36 | 0 |

## All day · Mid-round start

576 turns a day at the regeneration pace, online sixteen hours: runs go back to back. 200 whores, 50 thugs, 5 Low-Riders, $300,000.

| Home | Street only | Street and Produce | Runner only | Hijacker | Mixed, runs for profit | Mixed, supply runs | Mixed, either run | Moved on day |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| New York City | $33,394,567 | $33,394,567 | $4,122,605 | $31,503,873 | $33,398,542 | **$33,495,365** | **$33,495,365** | - |
| Detroit | $26,794,197 | $26,794,197 | $7,212,153 | $27,054,746 | $28,261,566 | **$31,382,878** | **$31,382,878** | 1 |
| Miami Beach | $29,583,777 | $29,583,777 | $7,357,943 | $28,423,110 | $29,583,777 | $29,583,777 | **$29,761,142** | 1 |
| Seattle | $32,176,809 | $32,176,809 | $6,606,553 | $30,091,197 | **$32,291,681** | $32,176,809 | **$32,291,681** | 1 |
| Beverly Hills | $36,857,429 | $36,857,429 | $5,008,210 | $35,900,486 | $36,857,429 | **$38,471,721** | **$38,471,721** | 1 |
| Las Vegas | $30,526,391 | $30,526,391 | $4,004,067 | $30,710,914 | $30,830,573 | **$36,508,302** | $35,375,863 | 1 |
| Los Angeles | $33,277,999 | $33,277,999 | $6,287,241 | $31,397,698 | **$33,531,280** | $33,274,745 | **$33,531,280** | 1 |
| Atlanta | $29,842,098 | $29,842,098 | $9,081,579 | $29,493,555 | $30,551,302 | $33,122,775 | **$33,321,476** | 1 |

From New York City:

| Strategy | Score | Cash | Whores | Thugs | Cars | Street | Produce | Runs (supply) | Run turns | Run profit | Hits | Hit take | Average Heat | Idle turns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Street only | $33,394,567 | $43,232,103 | 422 | 148 | 5 | 16,128 | 0 | 0 (0) | 0 | $0 | 0.0 | $0 | 28 | 0 |
| Street and Produce | $33,394,567 | $43,232,103 | 422 | 148 | 5 | 16,128 | 0 | 0 (0) | 0 | $0 | 0.0 | $0 | 28 | 0 |
| Runner only | $4,122,605 | $4,893,473 | 200 | 50 | 5 | 0 | 0 | 56 (0) | 2,912 | $4,593,473 | 0.0 | $0 | 0 | 13,216 |
| Hijacker | $31,503,873 | $40,770,136 | 403 | 140 | 5 | 14,476 | 0 | 0 (0) | 0 | $0 | 112.0 | $1,588,120 | 36 | 0 |
| Mixed, runs for profit | $33,398,542 | $43,151,541 | 419 | 146 | 29 | 15,752 | 0 | 18 (0) | 376 | $1,269,790 | 0.0 | $0 | 30 | 0 |
| Mixed, supply runs | $33,495,365 | $43,141,237 | 416 | 147 | 17 | 15,938 | 0 | 10 (10) | 190 | $0 | 0.0 | $0 | 37 | 0 |
| Mixed, either run | $33,495,365 | $43,141,237 | 416 | 147 | 17 | 15,938 | 0 | 10 (10) | 190 | $0 | 0.0 | $0 | 37 | 0 |

## Twice a day · Fresh start

A banked cap of 144 turns, morning and evening, two hours online each: a run has to reach its towns inside a session. 20 whores, 5 thugs, 1 Low-Rider, $20,000.

| Home | Street only | Street and Produce | Runner only | Hijacker | Mixed, runs for profit | Mixed, supply runs | Mixed, either run | Moved on day |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| New York City | $8,211,512 | $8,211,512 | $2,148,658 | $9,008,368 | $9,518,488 | $9,317,414 | **$9,775,395** | - |
| Detroit | $7,470,705 | $7,470,705 | $406,297 | $8,449,762 | $7,470,705 | **$9,097,185** | **$9,097,185** | 1 |
| Miami Beach | $7,759,878 | $7,759,878 | $1,967,545 | $7,751,726 | **$8,801,999** | $7,759,878 | **$8,801,999** | 1 |
| Seattle | $7,973,517 | $7,973,517 | $2,336,975 | $8,593,024 | **$8,627,725** | $8,554,244 | **$8,627,725** | 1 |
| Beverly Hills | $9,230,265 | $9,230,265 | $885,107 | $9,776,126 | $9,619,876 | **$10,117,718** | **$10,117,718** | 1 |
| Las Vegas | $8,481,093 | $8,481,093 | $1,075,751 | $9,564,481 | $9,215,664 | $10,343,389 | **$10,415,085** | 1 |
| Los Angeles | $8,143,790 | $8,143,790 | $1,603,680 | **$8,949,104** | $8,464,463 | $8,143,790 | $8,464,463 | 1 |
| Atlanta | $7,789,965 | $7,789,965 | $1,873,863 | $8,767,577 | $9,346,155 | $9,798,397 | **$10,177,433** | 1 |

From New York City:

| Strategy | Score | Cash | Whores | Thugs | Cars | Street | Produce | Runs (supply) | Run turns | Run profit | Hits | Hit take | Average Heat | Idle turns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Street only | $8,211,512 | $10,262,495 | 222 | 89 | 1 | 8,064 | 0 | 0 (0) | 0 | $0 | 0.0 | $0 | 15 | 0 |
| Street and Produce | $8,211,512 | $10,262,495 | 222 | 89 | 1 | 8,064 | 0 | 0 (0) | 0 | $0 | 0.0 | $0 | 15 | 0 |
| Runner only | $2,148,658 | $2,718,544 | 20 | 5 | 22 | 0 | 0 | 56 (0) | 952 | $2,803,544 | 0.0 | $0 | 0 | 7,112 |
| Hijacker | $9,008,368 | $11,363,531 | 210 | 84 | 1 | 7,239 | 0 | 0 (0) | 0 | $0 | 53.2 | $520,930 | 31 | 0 |
| Mixed, runs for profit | $9,518,488 | $11,964,070 | 209 | 83 | 22 | 7,129 | 0 | 55 (0) | 935 | $3,158,108 | 0.0 | $0 | 23 | 0 |
| Mixed, supply runs | $9,317,414 | $11,692,923 | 220 | 88 | 4 | 7,874 | 0 | 10 (10) | 190 | $0 | 0.0 | $0 | 33 | 0 |
| Mixed, either run | $9,775,395 | $12,242,174 | 208 | 83 | 22 | 7,123 | 0 | 55 (3) | 941 | $2,980,535 | 0.0 | $0 | 28 | 0 |

## Twice a day · Mid-round start

A banked cap of 144 turns, morning and evening, two hours online each: a run has to reach its towns inside a session. 200 whores, 50 thugs, 5 Low-Riders, $300,000.

| Home | Street only | Street and Produce | Runner only | Hijacker | Mixed, runs for profit | Mixed, supply runs | Mixed, either run | Moved on day |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| New York City | $11,854,694 | $11,854,694 | $3,126,058 | $12,535,879 | $12,438,142 | **$13,252,725** | **$13,252,725** | - |
| Detroit | $11,261,354 | $11,261,354 | $1,222,149 | $11,941,523 | $11,261,354 | **$13,099,095** | **$13,099,095** | 1 |
| Miami Beach | $11,326,738 | $11,326,738 | $3,122,789 | $11,443,889 | **$11,567,003** | $11,326,738 | **$11,567,003** | 1 |
| Seattle | $11,187,437 | $11,187,437 | $3,395,056 | **$11,834,939** | $11,754,649 | $11,187,437 | $11,754,649 | 1 |
| Beverly Hills | $13,603,313 | $13,603,313 | $2,072,416 | $14,310,273 | $13,984,194 | **$14,748,672** | **$14,748,672** | 1 |
| Las Vegas | $12,822,786 | $12,822,786 | $1,913,828 | **$13,546,965** | $13,518,112 | $12,822,786 | $13,518,112 | 1 |
| Los Angeles | $11,775,528 | $11,775,528 | $3,132,563 | $12,456,713 | **$12,583,552** | $11,775,528 | **$12,583,552** | 1 |
| Atlanta | $11,571,505 | $11,571,505 | $3,022,868 | $12,254,423 | $13,040,946 | $14,049,394 | **$14,891,065** | 1 |

From New York City:

| Strategy | Score | Cash | Whores | Thugs | Cars | Street | Produce | Runs (supply) | Run turns | Run profit | Hits | Hit take | Average Heat | Idle turns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Street only | $11,854,694 | $14,854,113 | 309 | 108 | 5 | 8,064 | 0 | 0 (0) | 0 | $0 | 0.0 | $0 | 11 | 0 |
| Street and Produce | $11,854,694 | $14,854,113 | 309 | 108 | 5 | 8,064 | 0 | 0 (0) | 0 | $0 | 0.0 | $0 | 11 | 0 |
| Runner only | $3,126,058 | $3,504,744 | 200 | 50 | 20 | 0 | 0 | 56 (0) | 952 | $3,279,744 | 0.0 | $0 | 0 | 7,112 |
| Hijacker | $12,535,879 | $15,792,356 | 300 | 103 | 5 | 7,224 | 0 | 0 (0) | 0 | $0 | 56.0 | $721,435 | 29 | 0 |
| Mixed, runs for profit | $12,438,142 | $15,555,435 | 315 | 110 | 20 | 7,146 | 0 | 54 (0) | 918 | $3,205,733 | 0.0 | $0 | 17 | 0 |
| Mixed, supply runs | $13,252,725 | $16,652,690 | 310 | 109 | 11 | 7,969 | 0 | 5 (5) | 95 | $0 | 0.0 | $0 | 34 | 0 |
| Mixed, either run | $13,252,725 | $16,652,690 | 310 | 109 | 11 | 7,969 | 0 | 5 (5) | 95 | $0 | 0.0 | $0 | 34 | 0 |
