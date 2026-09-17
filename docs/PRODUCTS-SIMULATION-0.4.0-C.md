# 0.4.0-C product effects and Heat simulation

Ruleset: classic-og-v0.4-d. Expected values, no dice: every row runs one product on one job for the whole horizon, fully supplied.
Girls are fully covered on a block with room, on a 50% cut. Product is priced at each product's reference cost; cooked
product is worth crack's reference cost less ingredients. A bust fines cash and seizes half of a two-trip product buffer.
Score is net cash plus workers gained or lost, each worth a day of baseline work.

Heat: max 100, decays 1 per 5-minute interval; drag from 40 (up to 35% of take at max);
bust rolls from 70 (up to 35% a trip at max), seizing 50% of product and fining 5% of cash.

## Gate

**Passes.** In every play style, crew and mood, at least two products win a job. Jobs won across all 72 situations: Crack 20, Weed 6, Ecstasy 11, Cocaine 4, Meth 4, Heroin 27.

## Best product per job

| Situation | Casino District | Wino Slums | Low Rent District | Nightclub District | Urban Ghetto | Cooking (thugs) |
| --- | --- | --- | --- | --- | --- | --- |
| Banked cap · Early · Happy | Cocaine (+13%) | Crack (+7%) | Crack (+3%) | Ecstasy (+20%) | Crack (+7%) | Meth (+27%) |
| Banked cap · Early · Struggling | Cocaine (+10%) | Heroin (+9%) | Heroin (+6%) | Ecstasy (+11%) | Heroin (+11%) | Weed (+8%) |
| Banked cap · Middle · Happy | Cocaine (+6%) | Crack (+11%) | Crack (+4%) | Ecstasy (+28%) | Crack (+8%) | Meth (+11%) |
| Banked cap · Middle · Struggling | Heroin (+5%) | Heroin (+94%) | Heroin (+36%) | Heroin (+16%) | Heroin (+59%) | Weed (+8%) |
| Banked cap · Late · Happy | Ecstasy (+17%) | Crack (+18%) | Crack (+4%) | Ecstasy (+24%) | Crack (+13%) | Crack (+8%) |
| Banked cap · Late · Struggling | Heroin (+13%) | Heroin (+214%) | Heroin (+38%) | Heroin (+19%) | Heroin (+76%) | Weed (+22%) |
| All day · Early · Happy | Cocaine (+9%) | Crack (+10%) | Crack (+3%) | Ecstasy (+23%) | Crack (+9%) | Meth (+27%) |
| All day · Early · Struggling | Heroin (+3%) | Heroin (+18%) | Heroin (+12%) | Ecstasy (+1%) | Heroin (+19%) | Weed (+8%) |
| All day · Middle · Happy | Ecstasy (+3%) | Crack (+11%) | Crack (+4%) | Ecstasy (+34%) | Crack (+8%) | Meth (+26%) |
| All day · Middle · Struggling | Heroin (+17%) | Heroin (+84%) | Heroin (+40%) | Heroin (+31%) | Heroin (+58%) | Weed (+8%) |
| All day · Late · Happy | Ecstasy (+15%) | Crack (+11%) | Crack (+4%) | Ecstasy (+22%) | Crack (+7%) | Crack (+8%) |
| All day · Late · Struggling | Heroin (+30%) | Heroin (+163%) | Heroin (+53%) | Heroin (+36%) | Heroin (+81%) | Weed (+8%) |

The percentage is how far the winner leads the runner-up.

## Banked cap

A full 144-turn bank spent in one sitting, 12 turns a trip. Heat has no time to decay.

### Early crew (30 whores, 10 thugs), happy

| Job | Crack | Weed | Ecstasy | Cocaine | Meth | Heroin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Casino District | $74,793<br>heat 8 · +7 whores | $79,387<br>heat 0 · +7 whores | $112,619<br>heat 25 · +9 whores | $129,360<br>heat 50 · +7 whores | $70,525<br>heat 66 · +6 whores | $80,357<br>heat 21 · +6 whores |
| Wino Slums | $33,335<br>heat 9 · +18 whores | $30,851<br>heat 0 · +18 whores | $26,144<br>heat 28 · +24 whores | $21,193<br>heat 54 · +18 whores | $25,700<br>heat 71 · +16 whores | $29,738<br>heat 22 · +16 whores |
| Low Rent District | $38,143<br>heat 9 · +13 whores | $37,171<br>heat 0 · +13 whores | $30,583<br>heat 27 · +18 whores | $29,611<br>heat 52 · +13 whores | $29,525<br>heat 69 · +12 whores | $33,790<br>heat 21 · +12 whores |
| Nightclub District | $57,556<br>heat 9 · +12 whores | $58,078<br>heat 0 · +12 whores | $89,005<br>heat 26 · +16 whores | $71,632<br>heat 51 · +12 whores | $50,542<br>heat 68 · +11 whores | $56,986<br>heat 21 · +11 whores |
| Urban Ghetto | $37,506<br>heat 9 · +16 whores | $34,725<br>heat 0 · +16 whores | $31,231<br>heat 27 · +21 whores | $33,877<br>heat 53 · +16 whores | $29,241<br>heat 70 · +14 whores | $34,069<br>heat 22 · +14 whores |
| Cooking (thugs) | $3,092<br>heat 9 | $2,844<br>heat 0 | $504<br>heat 27 | $1,800<br>heat 55 | $4,248<br>heat 46 | $2,160<br>heat 23 |

### Early crew (30 whores, 10 thugs), struggling

| Job | Crack | Weed | Ecstasy | Cocaine | Meth | Heroin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Casino District | $23,979<br>heat 8 · -1 whores | $31,729<br>heat 0 · +3 whores | $37,579<br>heat 24 · +1 whores | $41,894<br>heat 47 · -1 whores | $17,648<br>heat 61 · -4 whores | $35,955<br>heat 21 · +5 whores |
| Wino Slums | $13,747<br>heat 8 · +9 whores | $17,801<br>heat 0 · +13 whores | $10,893<br>heat 26 · +14 whores | $4,642<br>heat 51 · +9 whores | $5,985<br>heat 65 · +5 whores | $19,543<br>heat 22 · +15 whores |
| Low Rent District | $13,167<br>heat 8 · +5 whores | $17,858<br>heat 0 · +9 whores | $9,663<br>heat 25 · +9 whores | $5,819<br>heat 49 · +5 whores | $5,235<br>heat 64 · +1 whores | $18,927<br>heat 21 · +11 whores |
| Nightclub District | $19,957<br>heat 8 · +3 whores | $25,673<br>heat 0 · +7 whores | $31,781<br>heat 25 · +7 whores | $21,673<br>heat 49 · +3 whores | $12,564<br>heat 63 | $28,256<br>heat 21 · +10 whores |
| Urban Ghetto | $14,196<br>heat 8 · +7 whores | $18,130<br>heat 0 · +11 whores | $11,479<br>heat 26 · +11 whores | $8,692<br>heat 50 · +7 whores | $6,260<br>heat 65 · +3 whores | $20,260<br>heat 22 · +13 whores |
| Cooking (thugs) | $698<br>heat 9 · -1 thugs | $1,690<br>heat 0 | -$1,890<br>heat 25 · -3 thugs | -$306<br>heat 55 | $202<br>heat 42 · -3 thugs | $1,553<br>heat 23 |

### Middle crew (150 whores, 40 thugs), happy

| Job | Crack | Weed | Ecstasy | Cocaine | Meth | Heroin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Casino District | $309,880<br>heat 18 · +3 whores | $330,763<br>heat 0 · +3 whores | $455,533<br>heat 53 · +4 whores | $482,834<br>heat 88 · 0.5 busts · +3 whores | $224,696<br>heat 95 · 1.2 busts · +3 whores | $341,085<br>heat 44 · +3 whores |
| Wino Slums | $64,076<br>heat 18 · +8 whores | $54,156<br>heat 0 · +8 whores | $14,111<br>heat 54 · +10 whores | $2,014<br>heat 88 · 0.5 busts · +8 whores | $14,118<br>heat 95 · 1.2 busts · +7 whores | $57,089<br>heat 45 · +7 whores |
| Low Rent District | $105,942<br>heat 18 · +6 whores | $101,818<br>heat 0 · +6 whores | $54,038<br>heat 54 · +8 whores | $50,320<br>heat 88 · 0.5 busts · +6 whores | $43,044<br>heat 95 · 1.2 busts · +5 whores | $94,082<br>heat 44 · +5 whores |
| Nightclub District | $197,523<br>heat 18 · +5 whores | $199,729<br>heat 0 · +5 whores | $300,823<br>heat 53 · +7 whores | $216,655<br>heat 88 · 0.5 busts · +5 whores | $124,728<br>heat 95 · 1.2 busts · +4 whores | $202,401<br>heat 44 · +4 whores |
| Urban Ghetto | $91,503<br>heat 18 · +7 whores | $80,104<br>heat 0 · +7 whores | $44,411<br>heat 54 · +9 whores | $56,094<br>heat 88 · 0.5 busts · +7 whores | $33,785<br>heat 95 · 1.2 busts · +6 whores | $84,606<br>heat 44 · +6 whores |
| Cooking (thugs) | $12,366<br>heat 18 | $11,376<br>heat 0 | $2,016<br>heat 55 | -$1,348<br>heat 88 · 0.5 busts | $13,856<br>heat 83 · 0.2 busts | $8,640<br>heat 46 |

### Middle crew (150 whores, 40 thugs), struggling

| Job | Crack | Weed | Ecstasy | Cocaine | Meth | Heroin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Casino District | $76,562<br>heat 17 · -35 whores | $112,673<br>heat 0 · -17 whores | $123,707<br>heat 50 · -34 whores | $129,506<br>heat 85 · 0.4 busts · -35 whores | $19,131<br>heat 91 · 1.0 busts · -47 whores | $136,963<br>heat 44 · -2 whores |
| Wino Slums | -$16,151<br>heat 17 · -30 whores | $876<br>heat 0 · -12 whores | -$45,019<br>heat 50 · -27 whores | -$59,291<br>heat 86 · 0.4 busts · -30 whores | -$59,393<br>heat 91 · 1.0 busts · -43 whores | $15,431<br>heat 44 · +3 whores |
| Low Rent District | -$1,126<br>heat 17 · -32 whores | $19,405<br>heat 0 · -15 whores | -$30,992<br>heat 50 · -30 whores | -$41,185<br>heat 85 · 0.4 busts · -32 whores | -$49,306<br>heat 91 · 1.0 busts · -45 whores | $30,472<br>heat 44 · +1 whores |
| Nightclub District | $34,149<br>heat 17 · -33 whores | $59,608<br>heat 0 · -15 whores | $65,034<br>heat 50 · -31 whores | $24,738<br>heat 85 · 0.4 busts · -33 whores | -$18,235<br>heat 91 · 1.0 busts · -45 whores | $77,405<br>heat 44 |
| Urban Ghetto | -$6,091<br>heat 17 · -31 whores | $11,022<br>heat 0 · -13 whores | -$33,976<br>heat 50 · -29 whores | -$38,270<br>heat 85 · 0.4 busts · -31 whores | -$52,376<br>heat 91 · 1.0 busts · -44 whores | $26,924<br>heat 44 · +2 whores |
| Cooking (thugs) | $2,914<br>heat 18 · -5 thugs | $6,759<br>heat 0 | -$7,109<br>heat 51 · -12 thugs | -$9,570<br>heat 88 · 0.5 busts | -$386<br>heat 80 · 0.1 busts · -13 thugs | $6,210<br>heat 46 |

### Late crew (500 whores, 120 thugs), happy

| Job | Crack | Weed | Ecstasy | Cocaine | Meth | Heroin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Casino District | $1,015,990<br>heat 32 · +1 whores | $1,085,034<br>heat 0 · +1 whores | $1,321,770<br>heat 85 · 0.3 busts · +1 whores | $1,092,033<br>heat 100 · 2.1 busts · +1 whores | $413,327<br>heat 100 · 2.6 busts · +1 whores | $1,055,919<br>heat 79 · +1 whores |
| Wino Slums | $184,920<br>heat 32 · +3 whores | $152,520<br>heat 0 · +3 whores | -$26,827<br>heat 85 · 0.3 busts · +4 whores | -$231,934<br>heat 100 · 2.1 busts · +3 whores | -$191,459<br>heat 100 · 2.6 busts · +3 whores | $149,137<br>heat 79 · +3 whores |
| Low Rent District | $329,988<br>heat 32 · +2 whores | $316,422<br>heat 0 · +2 whores | $100,180<br>heat 85 · 0.3 busts · +3 whores | -$95,832<br>heat 100 · 2.1 busts · +2 whores | -$105,486<br>heat 100 · 2.6 busts · +2 whores | $270,921<br>heat 79 · +2 whores |
| Nightclub District | $634,011<br>heat 32 · +2 whores | $641,235<br>heat 0 · +2 whores | $841,012<br>heat 85 · 0.3 busts · +2 whores | $357,837<br>heat 100 · 2.1 busts · +2 whores | $125,464<br>heat 100 · 2.6 busts · +2 whores | $611,589<br>heat 79 · +2 whores |
| Urban Ghetto | $278,533<br>heat 32 · +2 whores | $241,190<br>heat 0 · +2 whores | $67,034<br>heat 85 · 0.3 busts · +3 whores | -$82,958<br>heat 100 · 2.1 busts · +2 whores | -$134,012<br>heat 100 · 2.6 busts · +2 whores | $237,909<br>heat 79 · +2 whores |
| Cooking (thugs) | $37,098<br>heat 32 | $34,128<br>heat 0 | -$19,915<br>heat 84 · 0.3 busts | -$182,771<br>heat 100 · 2.1 busts | -$99,283<br>heat 98 · 1.5 busts | $23,172<br>heat 78 |

### Late crew (500 whores, 120 thugs), struggling

| Job | Crack | Weed | Ecstasy | Cocaine | Meth | Heroin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Casino District | $243,205<br>heat 30 · -124 whores | $363,122<br>heat 0 · -66 whores | $329,682<br>heat 83 · 0.2 busts · -124 whores | $113,181<br>heat 100 · 2.0 busts · -124 whores | -$199,193<br>heat 100 · 2.6 busts · -165 whores | $415,493<br>heat 78 · -13 whores |
| Wino Slums | -$79,086<br>heat 30 · -122 whores | -$22,495<br>heat 0 · -64 whores | -$204,116<br>heat 83 · 0.2 busts · -121 whores | -$412,412<br>heat 100 · 2.0 busts · -122 whores | -$426,882<br>heat 100 · 2.6 busts · -164 whores | $19,647<br>heat 78 · -12 whores |
| Low Rent District | -$23,119<br>heat 30 · -123 whores | $44,987<br>heat 0 · -65 whores | -$154,267<br>heat 83 · 0.2 busts · -122 whores | -$358,673<br>heat 100 · 2.0 busts · -123 whores | -$394,833<br>heat 100 · 2.6 busts · -164 whores | $72,530<br>heat 78 · -12 whores |
| Nightclub District | $95,045<br>heat 30 · -123 whores | $179,554<br>heat 0 · -65 whores | $139,533<br>heat 83 · 0.2 busts · -123 whores | -$178,438<br>heat 100 · 2.0 busts · -123 whores | -$307,623<br>heat 100 · 2.6 busts · -164 whores | $221,454<br>heat 78 · -13 whores |
| Urban Ghetto | -$42,913<br>heat 30 · -123 whores | $14,036<br>heat 0 · -65 whores | -$167,137<br>heat 83 · 0.2 busts · -122 whores | -$353,432<br>heat 100 · 2.0 busts · -123 whores | -$405,392<br>heat 100 · 2.6 busts · -164 whores | $58,290<br>heat 78 · -12 whores |
| Cooking (thugs) | $8,871<br>heat 31 · -16 thugs | $20,277<br>heat 0 | -$36,193<br>heat 82 · 0.2 busts · -35 thugs | -$206,066<br>heat 100 · 2.1 busts | -$123,650<br>heat 94 · 1.3 busts · -38 thugs | $15,892<br>heat 78 |

## All day

576 turns at the regeneration pace, 12 a trip: a day of play with decay running alongside.

### Early crew (30 whores, 10 thugs), happy

| Job | Crack | Weed | Ecstasy | Cocaine | Meth | Heroin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Casino District | $373,871<br>heat 1 · +25 whores | $397,532<br>heat 0 · +25 whores | $595,158<br>heat 3 · +32 whores | $657,540<br>heat 5 · +25 whores | $355,784<br>heat 21 · +23 whores | $396,906<br>heat 2 · +23 whores |
| Wino Slums | $151,651<br>heat 1 · +58 whores | $135,863<br>heat 0 · +58 whores | $84,785<br>heat 4 · +74 whores | $75,178<br>heat 13 · +58 whores | $109,690<br>heat 70 · +54 whores | $133,433<br>heat 3 · +54 whores |
| Low Rent District | $189,231<br>heat 1 · +45 whores | $183,450<br>heat 0 · +45 whores | $135,041<br>heat 3 · +58 whores | $139,809<br>heat 7 · +45 whores | $143,480<br>heat 50 · +41 whores | $164,629<br>heat 3 · +41 whores |
| Nightclub District | $301,649<br>heat 1 · +40 whores | $304,641<br>heat 0 · +40 whores | $499,295<br>heat 3 · +52 whores | $384,912<br>heat 6 · +40 whores | $266,658<br>heat 43 · +37 whores | $295,875<br>heat 2 · +37 whores |
| Urban Ghetto | $182,601<br>heat 1 · +52 whores | $165,484<br>heat 0 · +52 whores | $130,284<br>heat 4 · +66 whores | $161,550<br>heat 9 · +52 whores | $137,793<br>heat 61 · +48 whores | $164,013<br>heat 3 · +48 whores |
| Cooking (thugs) | $12,366<br>heat 1 | $11,376<br>heat 0 | $2,016<br>heat 2 | $7,200<br>heat 5 | $16,992<br>heat 4 | $8,640<br>heat 2 |

### Early crew (30 whores, 10 thugs), struggling

| Job | Crack | Weed | Ecstasy | Cocaine | Meth | Heroin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Casino District | $93,785<br>heat 1 · -3 whores | $135,327<br>heat 0 · +8 whores | $153,377<br>heat 2 · +2 whores | $162,735<br>heat 4 · -3 whores | $67,396<br>heat 5 · -10 whores | $167,632<br>heat 2 · +19 whores |
| Wino Slums | $41,814<br>heat 1 · +20 whores | $57,549<br>heat 0 · +35 whores | $9,825<br>heat 3 · +30 whores | -$2,970<br>heat 5 · +20 whores | $15,233<br>heat 6 · +9 whores | $70,378<br>heat 3 · +48 whores |
| Low Rent District | $48,477<br>heat 1 · +11 whores | $69,042<br>heat 0 · +24 whores | $22,461<br>heat 3 · +19 whores | $15,129<br>heat 5 · +11 whores | $20,533<br>heat 5 · +2 whores | $78,114<br>heat 2 · +36 whores |
| Nightclub District | $80,514<br>heat 1 · +8 whores | $110,579<br>heat 0 · +20 whores | $133,012<br>heat 2 · +15 whores | $88,323<br>heat 4 · +8 whores | $51,557<br>heat 5 · -1 whores | $131,691<br>heat 2 · +32 whores |
| Urban Ghetto | $49,062<br>heat 1 · +16 whores | $65,547<br>heat 0 · +30 whores | $22,609<br>heat 3 · +25 whores | $22,908<br>heat 5 · +16 whores | $21,003<br>heat 6 · +5 whores | $80,682<br>heat 3 · +42 whores |
| Cooking (thugs) | $2,210<br>heat 1 · -4 thugs | $6,759<br>heat 0 | -$5,152<br>heat 2 · -7 thugs | -$1,224<br>heat 5 | $352<br>heat 4 · -8 thugs | $6,210<br>heat 2 |

### Middle crew (150 whores, 40 thugs), happy

| Job | Crack | Weed | Ecstasy | Cocaine | Meth | Heroin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Casino District | $1,273,561<br>heat 2 · +11 whores | $1,359,422<br>heat 0 · +11 whores | $1,901,993<br>heat 5 · +15 whores | $1,844,625<br>heat 83 · 1.7 busts · +11 whores | $767,256<br>heat 89 · 5.1 busts · +10 whores | $1,398,699<br>heat 4 · +10 whores |
| Wino Slums | $270,848<br>heat 2 · +30 whores | $228,272<br>heat 0 · +30 whores | $55,783<br>heat 5 · +39 whores | -$258<br>heat 84 · 1.9 busts · +30 whores | $37,347<br>heat 90 · 5.4 busts · +27 whores | $240,215<br>heat 4 · +27 whores |
| Low Rent District | $444,492<br>heat 2 · +22 whores | $427,096<br>heat 0 · +22 whores | $229,942<br>heat 5 · +29 whores | $190,333<br>heat 83 · 1.8 busts · +22 whores | $139,463<br>heat 90 · 5.3 busts · +20 whores | $393,087<br>heat 4 · +20 whores |
| Nightclub District | $826,131<br>heat 2 · +19 whores | $835,369<br>heat 0 · +19 whores | $1,285,850<br>heat 5 · +26 whores | $834,028<br>heat 83 · 1.8 busts · +19 whores | $425,155<br>heat 90 · 5.2 busts · +17 whores | $843,484<br>heat 4 · +17 whores |
| Urban Ghetto | $386,214<br>heat 2 · +26 whores | $337,706<br>heat 0 · +26 whores | $189,007<br>heat 5 · +34 whores | $212,527<br>heat 84 · 1.9 busts · +26 whores | $107,074<br>heat 90 · 5.3 busts · +23 whores | $355,532<br>heat 4 · +23 whores |
| Cooking (thugs) | $49,464<br>heat 2 | $45,504<br>heat 0 | $8,064<br>heat 5 | -$911<br>heat 83 · 1.8 busts | $66,485<br>heat 79 · 0.1 busts | $34,560<br>heat 4 |

### Middle crew (150 whores, 40 thugs), struggling

| Job | Crack | Weed | Ecstasy | Cocaine | Meth | Heroin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Casino District | $227,125<br>heat 1 · -92 whores | $385,165<br>heat 0 · -55 whores | $371,564<br>heat 4 · -89 whores | $449,875<br>heat 55 · -92 whores | $81,457<br>heat 82 · 1.2 busts · -111 whores | $539,366<br>heat 4 · -6 whores |
| Wino Slums | -$32,625<br>heat 1 · -76 whores | $9,979<br>heat 0 · -38 whores | -$122,722<br>heat 4 · -68 whores | -$142,821<br>heat 68 · -76 whores | -$122,789<br>heat 83 · 1.7 busts · -97 whores | $61,987<br>heat 4 · +10 whores |
| Low Rent District | $10,368<br>heat 1 · -83 whores | $73,872<br>heat 0 · -45 whores | -$77,885<br>heat 4 · -77 whores | -$82,601<br>heat 62 · -83 whores | -$94,624<br>heat 82 · 1.5 busts · -102 whores | $122,719<br>heat 4 · +3 whores |
| Nightclub District | $113,280<br>heat 1 · -85 whores | $212,430<br>heat 0 · -48 whores | $213,325<br>heat 4 · -80 whores | $127,690<br>heat 60 · -85 whores | -$12,987<br>heat 82 · 1.4 busts · -104 whores | $310,346<br>heat 4 · +1 whores |
| Urban Ghetto | -$3,036<br>heat 1 · -80 whores | $45,503<br>heat 0 · -42 whores | -$87,210<br>heat 4 · -73 whores | -$73,671<br>heat 65 · -80 whores | -$103,186<br>heat 82 · 1.6 busts · -100 whores | $108,722<br>heat 4 · +7 whores |
| Cooking (thugs) | $9,482<br>heat 2 · -18 thugs | $27,036<br>heat 0 | -$18,538<br>heat 5 · -30 thugs | -$32,355<br>heat 83 · 1.8 busts | $2,382<br>heat 18 · -31 thugs | $24,840<br>heat 4 |

### Late crew (500 whores, 120 thugs), happy

| Job | Crack | Weed | Ecstasy | Cocaine | Meth | Heroin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Casino District | $4,076,703<br>heat 3 · +4 whores | $4,353,732<br>heat 0 · +4 whores | $5,275,961<br>heat 80 · 0.6 busts · +6 whores | $3,095,724<br>heat 98 · 9.9 busts · +4 whores | $1,076,227<br>heat 100 · 11.8 busts · +4 whores | $4,498,129<br>heat 41 · +4 whores |
| Wino Slums | $745,807<br>heat 3 · +11 whores | $615,097<br>heat 0 · +11 whores | -$54,144<br>heat 81 · 0.7 busts · +15 whores | -$932,562<br>heat 98 · 9.9 busts · +11 whores | -$736,668<br>heat 100 · 11.8 busts · +10 whores | $664,964<br>heat 42 · +10 whores |
| Low Rent District | $1,328,086<br>heat 3 · +8 whores | $1,273,481<br>heat 0 · +8 whores | $450,525<br>heat 81 · 0.6 busts · +11 whores | -$516,604<br>heat 98 · 9.9 busts · +8 whores | -$478,940<br>heat 100 · 11.8 busts · +7 whores | $1,180,291<br>heat 41 · +7 whores |
| Nightclub District | $2,549,788<br>heat 3 · +7 whores | $2,578,846<br>heat 0 · +7 whores | $3,381,245<br>heat 81 · 0.6 busts · +10 whores | $864,353<br>heat 98 · 9.9 busts · +7 whores | $215,395<br>heat 100 · 11.8 busts · +7 whores | $2,623,840<br>heat 41 · +7 whores |
| Urban Ghetto | $1,122,224<br>heat 3 · +10 whores | $971,749<br>heat 0 · +10 whores | $318,648<br>heat 81 · 0.7 busts · +13 whores | -$477,917<br>heat 98 · 9.9 busts · +10 whores | -$564,036<br>heat 100 · 11.8 busts · +9 whores | $1,041,341<br>heat 41 · +9 whores |
| Cooking (thugs) | $148,392<br>heat 3 | $136,512<br>heat 0 | -$18,176<br>heat 80 · 0.4 busts | -$714,398<br>heat 97 · 9.5 busts | -$392,013<br>heat 91 · 6.4 busts | $103,680<br>heat 33 |

### Late crew (500 whores, 120 thugs), struggling

| Job | Crack | Weed | Ecstasy | Cocaine | Meth | Heroin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Casino District | $672,557<br>heat 3 · -338 whores | $1,192,423<br>heat 0 · -215 whores | $1,098,409<br>heat 31 · -336 whores | $230,736<br>heat 93 · 5.7 busts · -338 whores | -$681,762<br>heat 100 · 8.6 busts · -396 whores | $1,712,291<br>heat 32 · -51 whores |
| Wino Slums | -$208,836<br>heat 3 · -330 whores | -$69,315<br>heat 0 · -207 whores | -$489,226<br>heat 32 · -326 whores | -$1,067,656<br>heat 93 · 5.8 busts · -330 whores | -$1,142,539<br>heat 100 · 8.7 busts · -388 whores | $110,832<br>heat 33 · -44 whores |
| Low Rent District | -$56,007<br>heat 3 · -333 whores | $151,841<br>heat 0 · -211 whores | -$340,351<br>heat 32 · -330 whores | -$932,822<br>heat 93 · 5.8 busts · -333 whores | -$1,076,189<br>heat 100 · 8.7 busts · -392 whores | $325,199<br>heat 32 · -47 whores |
| Nightclub District | $269,458<br>heat 3 · -334 whores | $593,845<br>heat 0 · -212 whores | $539,400<br>heat 32 · -331 whores | -$487,184<br>heat 93 · 5.7 busts · -334 whores | -$900,233<br>heat 100 · 8.7 busts · -393 whores | $929,171<br>heat 32 · -48 whores |
| Urban Ghetto | -$109,519<br>heat 3 · -331 whores | $50,650<br>heat 0 · -209 whores | -$378,155<br>heat 32 · -328 whores | -$920,627<br>heat 93 · 5.8 busts · -331 whores | -$1,098,254<br>heat 100 · 8.7 busts · -390 whores | $267,761<br>heat 33 · -46 whores |
| Cooking (thugs) | $28,906<br>heat 3 · -53 thugs | $81,108<br>heat 0 | -$54,085<br>heat 24 · -90 thugs | -$791,050<br>heat 97 · 9.5 busts | -$206,150<br>heat 85 · 2.2 busts · -93 thugs | $74,520<br>heat 33 |

## Bringing Heat down

| From | To | Waiting | Clean work at regeneration pace | Bribe: Early ($50,000 net worth) / Middle ($800,000 net worth) / Late ($6,000,000 net worth) |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 70 | 2.5 h | 60 turns | $3,000 / $48,000 / $360,000 |
| 100 | 40 | 5.0 h | 120 turns | $6,000 / $96,000 / $720,000 |
| 70 | 0 | 5.8 h | 140 turns | $7,000 / $112,000 / $840,000 |

## Happiness per dollar

What it costs to hold enough product that whore happiness takes no product penalty, per whore.

| Product | Happiness weight | Units per whore | Cost per whore |
| --- | ---: | ---: | ---: |
| Crack | 1 | 2.00 | $20 |
| Weed | 1.4 | 1.43 | $11 |
| Ecstasy | 0.7 | 2.86 | $86 |
| Cocaine | 0.8 | 2.50 | $100 |
| Meth | 0.4 | 5.00 | $75 |
| Heroin | 2 | 1.00 | $15 |
