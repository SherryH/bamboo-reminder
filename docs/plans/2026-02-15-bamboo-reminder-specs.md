# Bamboo Bank — Spec by Examples (Given/When/Then)

**Date**: 2026-02-15
**Source**: Design doc v3 + spec-slicing skill
**Implementation order**: Slice 1 → Slice 2 → Slice 4 → Slice 3

## Business Goals

| ID | Goal | Priority |
|----|------|----------|
| G1 | User receives daily inspiration to cultivate compassion | Must-have |
| G2 | User is reminded to do a good deed each day | Must-have |
| G3 | User is reminded to save/donate daily | Must-have |
| G4 | Message arrives automatically without user action | Must-have |
| G5 | User never receives duplicate messages | Must-have |
| G6 | System fails safely (no message > wrong message) | Must-have |

---

## Slice 1: User receives daily inspiration message

**User Story:** As the user, I receive a formatted message with a quote, good deed suggestion, and donation reminder, so that I cultivate daily compassion.

**Business Goals:** G1, G2, G3

### AC1: Successful message send
```gherkin
Given the server is running with valid LINE credentials
And quotes.json contains 30 bilingual quotes (text + textZh)
And deeds.json contains 30 bilingual deeds (text + textZh)
And the current dayCount in Redis is 0
When GET /send is called
Then a LINE push message is sent to the configured user
And the message contains the quote in both Traditional Chinese and English
And the message contains the deed in both Traditional Chinese and English
And the message contains "今天存下你的五毛錢" and "Save your 50 cents today"
And the message contains "Day 1"
And the response is { sent: true, dayCount: 1 }
```

### AC2: Message rotates through content sequentially
```gherkin
Given dayCount in Redis is 5
And quotes.json has 30 bilingual quotes
And deeds.json has 30 bilingual deeds
When GET /send is called
Then the message contains quote at index 5 in both Traditional Chinese and English
And the message contains deed at index 5 in both Traditional Chinese and English
And the message contains "Day 6"
```

### AC3: Content wraps around after exhausting all items
```gherkin
Given dayCount in Redis is 30
And quotes.json has 30 bilingual quotes
When GET /send is called
Then the message contains quote at index 0 in both Traditional Chinese and English
And the message contains "Day 31"
```

### AC4: LINE API failure retries once
```gherkin
Given the server is running
And the LINE API returns an error on first attempt
When GET /send is called
Then the server waits 1 second
And retries the LINE push message once
```

### AC5: LINE API failure after retry returns error
```gherkin
Given the server is running
And the LINE API returns errors on both attempts
When GET /send is called
Then the response status is 500
And the response contains error details
And stdout contains "ERROR" with timestamp
```

### AC6: Redis unavailable returns safe error
```gherkin
Given the server is running
And Upstash Redis is unreachable
When GET /send is called
Then no LINE message is sent
And the response status is 500
And stdout contains "ERROR" with details
```

### AC7: Missing env vars prevent server start
```gherkin
Given LINE_CHANNEL_ACCESS_TOKEN is not set
When the server starts
Then it exits with a non-zero code
And stderr lists the missing variable names
```

**Independence:** Can ship alone. User can manually call `/send` to receive a message.

---

## Slice 2: User receives exactly one message per day

**User Story:** As the user, I receive exactly one message per day even if /send is triggered multiple times, so that I'm not spammed.

**Business Goals:** G5, G6

### AC1: Duplicate request on same day is blocked
```gherkin
Given a message was already sent today (sent:<today> key exists in Redis)
When GET /send is called again
Then no LINE message is sent
And the response is { sent: false, reason: "already_sent" }
And stdout contains "SKIPPED already_sent"
```

### AC2: New day allows sending again
```gherkin
Given a message was sent yesterday (sent:<yesterday> key exists in Redis)
And today's sent key does not exist
When GET /send is called
Then a LINE message is sent
And the response is { sent: true, dayCount: N }
```

### AC3: Duplicate prevention is atomic
```gherkin
Given today's sent key does not exist in Redis
When two GET /send requests arrive simultaneously
Then exactly one LINE message is sent
And one request returns { sent: true }
And the other returns { sent: false, reason: "already_sent" }
```

### AC4: Sent keys auto-expire after 48 hours
```gherkin
Given a sent:<date> key was set 49 hours ago
When checking Redis for that key
Then the key no longer exists
```

### AC5: Date is computed in Asia/Taipei timezone
```gherkin
Given the server clock is 2026-02-16 03:00 UTC (= 11:00 AM Feb 16 Taipei)
When GET /send is called
Then the duplicate check uses date "2026-02-16"
And is independent of server timezone setting
```

**Independence:** Can ship alone. Adds duplicate protection to Slice 1.

---

## Slice 3: Message arrives automatically at lunchtime

**User Story:** As the user, I receive my daily message at noon Taipei time without doing anything, so that the habit forms effortlessly.

**Business Goals:** G4

### AC1: GitHub Actions triggers at correct time
```gherkin
Given the GitHub Actions workflow is configured with cron '0 4 * * *'
When the cron fires
Then it sends HTTP GET to the RENDER_URL/send secret
And the workflow timeout is 2 minutes
```

### AC2: Workflow handles Render cold start
```gherkin
Given the Render service is sleeping (no requests for 15+ minutes)
When GitHub Actions calls GET /send
Then the service wakes within 90 seconds
And the request completes within the 2-minute timeout
And the response is 200
```

### AC3: Workflow reports failure clearly
```gherkin
Given the /send endpoint returns HTTP 500
When the GitHub Actions workflow checks the response
Then the workflow exits with failure
And the GitHub Actions log shows "Failed to send daily message"
```

### AC4: Manual trigger works for testing
```gherkin
Given the workflow has workflow_dispatch enabled
When I manually trigger the workflow from GitHub Actions UI
Then it calls GET /send
And I receive the daily message on LINE
```

**Independence:** Can ship alone. Just needs a `/send` endpoint to call.

---

## Slice 4: Server validates webhook signatures

**User Story:** As the user, my bot only processes legitimate LINE webhook events, so that no one can impersonate LINE.

**Business Goals:** G6

### AC1: Valid LINE webhook is accepted
```gherkin
Given the server is running with LINE_CHANNEL_SECRET configured
When LINE sends a POST to /webhook with valid X-Line-Signature header
Then the server returns 200
```

### AC2: Invalid webhook signature is rejected
```gherkin
Given the server is running
When a POST to /webhook arrives with invalid X-Line-Signature
Then the server returns 401 or 403
And the request body is not processed
```

### AC3: Webhook without signature is rejected
```gherkin
Given the server is running
When a POST to /webhook arrives without X-Line-Signature header
Then the server returns 401 or 403
```

**Independence:** Can ship alone. Independent POST endpoint.

---

## Independence Verification

| Slice | Ships Alone? | Dependencies | Resolution |
|-------|-------------|--------------|------------|
| 1. Daily inspiration message | Yes | None | Core feature, standalone |
| 2. Exactly one per day | Yes | None | Works with or without Slice 1 |
| 3. Automatic lunchtime trigger | Yes | Needs /send endpoint | Ships after Slice 1 |
| 4. Webhook validation | Yes | None | Independent POST endpoint |

## Implementation Order

```
Slice 1 → Slice 2 → Slice 4 → Slice 3
  core     safety    security   automation
```
