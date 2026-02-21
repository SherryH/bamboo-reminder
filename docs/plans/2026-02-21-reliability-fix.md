# Fix Daily Reminder Reliability

**Date**: 2026-02-21
**Status**: v3 (post critique round 2 — final)

## Problem Analysis

The existing uncommitted changes attempt to fix two real issues but introduce new problems.

### Issue 1: Render Cold Start Timeout

Render free tier spins down after 15 minutes of inactivity. Cold start takes 30-120s. The original `--max-time 90` sometimes isn't enough, causing the workflow to fail.

**Current fix (problematic)**:
- Adds a separate "Wake up Render service" step that curls the root URL (which has no handler — returns 404)
- Sleeps 5 seconds for "stabilization" (arbitrary)
- Then makes the actual `/send` request with another 90s timeout
- Bumps workflow timeout from 2 to 5 minutes

**What's wrong**:
- Two-step approach adds complexity for no reliability gain — if the wake-up curl succeeds, the service is already warm; the 5s sleep is pointless
- Root URL `/` has no handler, so the 404 response doesn't confirm the app is healthy
- Worst case: 120s (wake) + 5s (sleep) + 90s (send) = 215s of waiting across two serial HTTP calls
- If the wake-up curl times out after 120s, the `|| true` silently swallows it, and the send step still fails

### Issue 2: Manual Trigger Corrupts State

`workflow_dispatch` (manual trigger) calls `/send`, which sets the `sent:<date>` Redis key. When cron fires later, it skips — no message at the scheduled time.

**Current fix (problematic)**:
- Adds `?force=true` query param for `workflow_dispatch` events
- Server skips `SET NX` when `force=true`

**What's wrong**:
- **`force=true` still calls `redis.incr('dayCount')`** — each manual trigger permanently advances the counter. If you test 3 times, dayCount jumps by 3, and future messages skip quotes/deeds
- `force=true` doesn't set the sent key (intentional), so cron will also send later — meaning on manual-trigger days, `dayCount` is incremented by both force AND cron, skipping 2 entries instead of 1

### Issue 3: HTTP 429 Semantics

Changed already_sent response from `200` to `429`. 429 means "Too Many Requests" (rate limiting), not idempotency. However, distinct status codes do simplify the bash workflow compared to JSON body parsing. This is a minor issue — pragmatically acceptable for an internal caller.

## Proposed Changes

### 1. Add health endpoint (`GET /`)

```js
app.get('/', (req, res) => res.json({ status: 'ok' }));
```

One line. Gives the workflow's wake-up curl a meaningful 200 response instead of a 404.

### 2. Fix `force=true`: preview without mutating state

When `force=true`:
- Skip `SET NX` (don't check or set the sent flag) — **already correct**
- **Read** `dayCount` without incrementing (`redis.get` instead of `redis.incr`)
- Compute preview count: `(currentCount || 0) + 1`
- Send the message showing what the next cron run will send
- No state is mutated — cron runs normally later

```js
app.get('/send', async (req, res) => {
  try {
    const today = getTaipeiDate();
    const force = req.query.force === 'true';

    if (!force) {
      const setResult = await redis.set(`sent:${today}`, '1', { nx: true, ex: 172800 });
      if (!setResult) {
        console.log(`SKIPPED already_sent date=${today}`);
        return res.status(429).json({ sent: false, reason: 'already_sent' });
      }
    }

    // force: peek without incrementing (preview next message). cron: increment normally.
    // redis.get returns a string or null; Number(null) === 0, so first-ever run produces dayCount 1.
    const dayCount = force
      ? Number(await redis.get('dayCount') || 0) + 1
      : await redis.incr('dayCount');

    const quote = quotes[(dayCount - 1) % quotes.length];
    const deed = deeds[(dayCount - 1) % deeds.length];
    const message = formatMessage(quote, deed, dayCount);

    await pushMessage(message);

    console.log(`SENT day=${dayCount} date=${today} force=${force}`);
    res.json({ sent: true, dayCount, preview: force });
  } catch (err) {
    console.error(`ERROR ${new Date().toISOString()} ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});
```

**Behavior summary**:

| Trigger | SET NX | dayCount | sent key set | Message sent |
|---------|--------|----------|-------------|-------------|
| Cron (normal) | Yes, check + set | `INCR` (advances) | Yes | Yes |
| Cron (already sent) | Yes, returns null | — | Already set | No (429) |
| Manual (force) | Skipped | `GET` (peek only) | No | Yes (response includes `preview: true`) |

### 3. Simplify workflow: single step with retry

Replace two steps (wake-up + request) with one step that retries on cold-start timeout:

```yaml
- name: Trigger daily message
  run: |
    SEND_URL="${{ secrets.RENDER_URL }}/send"
    MAX_ATTEMPTS=2
    if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
      SEND_URL="${SEND_URL}?force=true"
      MAX_ATTEMPTS=1  # No retry for force — prevents duplicate messages
      echo "Manual trigger — preview mode (no state changes)"
    fi
    for attempt in $(seq 1 $MAX_ATTEMPTS); do
      response=$(curl -s -w "\n%{http_code}" \
        --max-time 100 \
        "$SEND_URL")
      http_code=$(echo "$response" | tail -1)
      # Break on any application-level HTTP response (200, 429, 5xx).
      # Only retry on 000 (curl timeout) or 502/503 (Render boot errors).
      if [ "$http_code" != "000" ] && [ "$http_code" != "502" ] && [ "$http_code" != "503" ]; then break; fi
      echo "Attempt $attempt: response $http_code (cold start?), retrying..."
    done
    echo "Status: $http_code"
    echo "Response: $response"
    if [ "$http_code" = "200" ]; then
      echo "::notice::Daily message sent successfully"
    elif [ "$http_code" = "429" ]; then
      echo "::warning::Message already sent today — skipping"
    else
      echo "::error::Failed to send daily message (HTTP $http_code)"
      exit 1
    fi
```

**Why this is better**:
- `--max-time 100` handles worst-case cold starts in a single request (dropped `--connect-timeout` — redundant when `--max-time` is set)
- Retries on `000` (curl timeout), `502`, and `503` (Render boot errors) — only breaks on real application responses
- SET NX makes cron retries safe — even if the first attempt's message was delivered but the response was lost, the retry sees the key and returns 429
- `force=true` skips retries entirely (`MAX_ATTEMPTS=1`) to prevent duplicate messages, since force mode has no SET NX dedup guard
- Single step, no arbitrary sleeps, `timeout-minutes: 5` covers worst case (2x100s=200s, well within 300s)
- Body extraction simplified: print raw `$response` for debug (no `sed` parsing needed — body is never acted upon)

### 4. Update tests

The project uses Jest (per `package.json` — note: the global CLAUDE.md specifies Vitest, but this project predates that convention). New tests will use Jest to match existing patterns.

**Consolidate test setup**: Merge the two existing `describe` blocks' duplicated `beforeEach` into a single shared setup. Add `mockRedisGet` to the Redis mock alongside `set` and `incr`. Tests that don't use `get` simply never call it.

Add tests for force parameter:
- `force=true` sends message without calling `redis.set` (no duplicate check)
- `force=true` reads dayCount via `redis.get` instead of `redis.incr`
- `force=true` returns 200 with `{ sent: true, dayCount, preview: true }`
- `force=true` with `redis.get` returning `null` (first-ever run) should produce `dayCount: 1`
- `GET /` returns 200

Update existing test for 429 status (already done in current diff).

## Implementation Order

1. `src/index.js` — add health endpoint, fix force mode logic
2. `src/__tests__/send.test.js` — add new tests (must add `get` to Redis mock)
3. Run tests: `npm test`
4. `.github/workflows/daily-reminder.yml` — replace two-step with retry loop

## Files Changed

| File | Change |
|------|--------|
| `src/index.js` | Add `GET /` health endpoint; fix force mode to peek dayCount with `Number()` coercion |
| `.github/workflows/daily-reminder.yml` | Replace wake-up step with single-step retry loop; no retry on force |
| `src/__tests__/send.test.js` | Add force=true tests (including null dayCount edge case); add GET / test |

## Design Decisions

1. **429 for already_sent**: Not semantically perfect, but distinct status codes (200/429/5xx) make the bash workflow robust. Internal caller only — not a public API.
2. **No retry for force mode**: Force has no SET NX dedup guard, so retrying could double-send. Single attempt is safer for a manual test action.
3. **`Number()` coercion on redis.get**: Upstash Redis REST returns strings. Without coercion, `"5" + 1 = "51"` in JavaScript.
4. **Preview-ahead-by-one**: Force mode shows `dayCount + 1` (what the next cron will send). If cron already ran today, it shows tomorrow's message — a minor quirk, not worth redesigning.

## Change Log

### v1
- Initial analysis of existing diff problems and proposed fixes

### v1 → v2 (Critique Round 1)
- **Fixed (C3)**: `redis.get` returns string — added `Number()` coercion to prevent `"5" + 1 = "51"`
- **Fixed (C1)**: Force mode double-send on retry — set `MAX_ATTEMPTS=1` for `workflow_dispatch`
- **Fixed (M1)**: Retry now also triggers on 502/503 (Render boot errors), not just curl timeout `000`
- **Added (M2)**: Test for `GET /` health endpoint
- **Added (M4)**: Test for `force=true` when `dayCount` key is null in Redis
- **Clarified**: Health endpoint framing (wake-up confirmation, not Render health check)
- **Clarified**: Added Implementation Order section
- **Clarified**: Documented Jest usage as project-level exception to global Vitest convention
- **Removed**: `sleep 10` between retries (arbitrary, adds nothing if 120s already timed out)
- **Noted**: Preview-ahead-by-one behavior is a minor quirk, documented in Design Decisions

### v2 → v3 (Critique Round 2)
- **Fixed (M2)**: Force response now includes `preview: true` field so callers can distinguish preview from real send
- **Fixed (M3)**: Reduced `--max-time` from 120 to 100 (2x100=200s, comfortable within 300s timeout)
- **Simplified**: Dropped `--connect-timeout 30` (redundant when `--max-time` is set)
- **Simplified**: Dropped `sed '$d'` body extraction — print raw response for debug (body is never parsed)
- **Simplified**: Consolidated test `beforeEach` setup — one shared mock with `set`, `incr`, `get`
- **Simplified**: Health endpoint test asserts only status 200 (no body assertion)
- **Clarified**: Code comment now documents `Number(null) === 0` behavior for first-ever run
