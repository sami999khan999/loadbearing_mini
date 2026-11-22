---
title: Shutdown
description: Why a stop ends every stream cleanly at a random point in a window, rather than cutting them all at once.
---

# Shutdown

A deploy stops each replica in turn, each holding thousands of streams. Cut at once, every tab reconnects
in the same second — each a principal resolution, a Postgres read and a replay — and the next replica
takes the herd. **So a stop hands streams on.** `RealtimeBootstrap.stop`:

1. Stops accepting — no new connections, idle ones closed.
2. Calls `RealtimeSubscriber.drain(budget / 2)`. Every open stream's deadline moves to a random
   point inside that window, and each ends **cleanly** there, the way it does at its maximum age.
3. Emits `realtime.stream.drained { streams, durationMs }` — `streams` is `-1` if the budget ran
   out first.
4. Waits, inside what is left of the budget, for the server to close: every drained stream still
   has its last frame to write, and a response that finishes leaves an idle socket, which is
   swept every 50 ms.
5. Cuts whatever is still open, disposes the container, emits `process.stopped`.

**Step 4 was missing until `CP7.5`:** cutting right after the drain lost the last stream's final frame
50 ms early, so its client saw `UND_ERR_SOCKET` and backed off on every deploy. Measured in a `node:24`
Linux container, built process, five streams, default twenty-second budget:

| | streams ending cleanly | exit |
|---|---|---|
| before | 4 of 5; the last cut at 9 129 ms | 0 after 9.2 s |
| after, two runs | 5 of 5 | 0 after 10.1 s and 9.7 s |

(`SIGTERM` to the web process exited 0 after 6.0 s: srvx's five-second window plus the container's
pre-dispose second.) **A clean end is what matters:** `RealtimeStream` reopens within a second with a
`lastEventId`, landing on another replica that replays from the shared log; a cut is an error and the
client backs off — right for an outage, wrong for a deploy. A second signal joins the running stop, and
Redis refuses to reopen after `dispose()`, so a late `finally` cannot hold the process open.
