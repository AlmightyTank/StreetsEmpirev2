# Career Storylines 2.4.0 audit

## Existing ownership paths

- Career identity and the seven-day switch cooldown are owned by `PlayerCareerService`; story code must read this service and never duplicate switching.
- Contract lens remains `CAREER_PRESENTATION.contractCategories`.
- Verified progress must originate from settled `ActivityService`/quest receipts, not client navigation, polling, or synthetic clicks.
- Quest, contact, faction, profile cosmetic, legacy, notification, and admin services remain the owners of their existing records and rewards.

## No-entitlement-change matrix

| Story outcome | New story record | Existing gameplay entitlement | Competitive power |
| --- | --- | --- | --- |
| Chapter progress | Yes | None | None |
| Branch choice | Immutable choice | Cosmetic/profile recognition only | None |
| Contact/faction crossover | Safe reference and relationship note | Existing service policy applies | No permanent stat |
| Finale | Portfolio/legacy biography | Bounded title, badge, or moment | No permanent stat |
| Career switch | Preserve archived history | Existing seven-day cooldown | No reset or grant |

Career storylines are additive and disabled for rounds without the 2.4 capability.
