# Capacity admission (Slice A)

Slice A is implemented as a dormant, account-scoped waiting room. It does not
run until both environment gates and the database setting are enabled:

```dotenv
ADMISSION_CAPACITY_ENABLED=false
ADMISSION_SUPPORTER_PRIORITY_ENABLED=false
```

When enabled, `POST /api/admission/join` creates one ticket per account for the
current round and `GET /api/admission/status` returns `disabled`, `queued`, or
`admitted`. Tickets, leases, capacity, and rotation are isolated per round;
queue operations resolve the currently running round server-side.
`POST /api/admission/renew` renews the short lease; `POST /api/admission/leave`
cancels it. The web client API is in `apps/web/src/api/admission.ts`.

Only authenticated `/api/game/*` requests require an unexpired admission
lease. Authentication, account settings, payments, supporter pages, queue
polling, public routes and health checks remain available at capacity.

## Fairness and safety

- Leases and tickets live in Postgres and are account-and-round scoped, so
  tabs/devices cannot consume additional slots and rounds cannot share leases.
- Admission claims run in serializable transactions and retry PostgreSQL
  serialization conflicts.
- Supporter priority checks the paid Stripe/Google Play entitlement at join and
  promotion time. Trials, manual cosmetics, and expired memberships stay in the
  standard lane.
- When both lanes are eligible, the rotation admits three supporters followed
  by one standard player. A standard lane always progresses when it has an
  eligible ticket.
- Expired leases are reclaimed; admitted players are never displaced.

## Admin operations

- `GET /api/admin/admission/:roundId` — that round's settings and queue/lease counts.
- `PUT /api/admin/admission` — configure `roundId`, `enabled`, `capacity`, and
  `supporterPriority`; requires a reason and is audited.
- `POST /api/admin/admission/clear` — clear one round's tickets and leases;
  provide `roundId`, requires a reason, and is audited.

The migration is `20261110000000_capacity_admission`. Capacity must be selected
from measured load-test results; no default capacity is invented by this
feature.
