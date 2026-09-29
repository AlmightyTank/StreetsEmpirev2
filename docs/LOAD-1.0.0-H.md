# Load test (2026-09-27)

300 simulated players, each with its own address, on one API process and a local PostgreSQL 16 (default pool, 4 CPUs); sustained play for 60 s polling every 20 s.

| Scenario | Requests | p50 ms | p95 ms | max ms | Budget (ms) | Statuses | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Registration + join | 600 | 323 | 652 | 968 | p95 ≤ 3000 | 201×600 | pass |  |
| Login spike | 300 | 748 | 1200 | 1278 | p95 ≤ 3000 | 200×300 | pass |  |
| Sustained play: dashboard + bell | 1788 | 61 | 172 | 272 | p95 ≤ 500 | 200×1788 | pass | ≈ 900 players at the game's real once-a-minute poll |
| Sustained play: actions | 598 | 181 | 295 | 379 | p95 ≤ 1000 | 200×598 | pass | 300 players each acting every 15 s ≈ 20 actions/s |
| Idle write (baseline) | 10 | 90 | 92 | 94 | p95 ≤ 1000 | 200×10 | pass |  |
| Burst: every player buys at once | 600 | 7815 | 8313 | 8697 | max ≤ 12000 | 200×600 | pass | ≈ 69 writes/s drained |
| Burst: every player scouts + produces at once | 600 | 9047 | 10005 | 10428 | max ≤ 12000 | 200×600 | pass |  |
| Notification burst | 301 | 632 | 662 | 664 | p95 ≤ 750 | 201×1 200×300 | pass | broadcast reached 300/300 bells in 54 s (alerts run once a minute) |
| Mass season end | 1 | 13304 | 13304 | 13304 | p95 ≤ 60000 | 200×1 | pass | ENDED · 300/300 players ranked · 44.3 ms per player |
Run with `npm run qa:load-test` (defaults: 300 players, a poll every 20 s for 60 s, an action every 15 s). It builds its own scratch database and API process, so it never touches `.env`'s database or a live server.

## What it found, and what changed

- **Bursts failed with server errors.** On the first 300-player run, 375 of 600 simultaneous purchases got a 500.
  - The cause was Prisma P2028: a transaction could not get a pool connection within Prisma's default 2 s wait.
  - The fix has two parts:
    - The client's default transaction wait is now 10 s (15 s timeout), so a burst queues instead of failing.
    - If the pool still cannot serve a request, the answer is `503 SERVER_BUSY` with `Retry-After` ("nothing happened, try again"), never a 500. Every game action carries an action id, so the retry is safe.
  - Result: 0 errors in every scenario.
- **Big seasons could not close.** Ending a season settles and ranks every player in one transaction, at about 45–50 ms a player here.
  - The natural season end had a fixed 30 s timeout, so a season of about 640 players or more would have failed to close, and failed again every minute after.
  - The close timeout now grows with the season: 250 ms a player, at least 1 minute, at most 30 minutes. This applies to the natural end, "End early", and a start that hands over from a running season.
  - 300 players closed in 13 s, and every one was ranked.
- **Capacity.** One API process on 4 CPUs drains about 70 writes a second. Most of that time is Prisma query handling in the Node process (profiled), not the database.
  - That covers about 1,000 very active players (an action every 15 s each), or far more ordinary ones.
  - The bursts show the ceiling: when every player acts in the same second, the last answer still comes within about 10.5 s. That is inside the game client's 15 s timeout, with no errors.
  - If Monitoring ever shows write p95 climbing towards seconds in normal play, the next steps are fewer queries per action, then more than one API process. Both are post-1.0 work.
- **Pool size.** A larger pool (`connection_limit=25` on `DATABASE_URL`) made no difference: the process is CPU-bound, not connection-bound. The default is fine.
