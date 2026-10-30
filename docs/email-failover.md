# Failover and uncertainty contract

Read [architecture](email-architecture.md) before changing retry policy.

| Evidence | Queue decision | Provider circuit | Switch provider? |
|---|---|---|---|
| Valid acceptance receipt / documented EmailJS OK | accepted; store providerMessageId when available | Last accepted | Never |
| Documented HTTP 429 rejection | Try next enabled provider; keep pending if none | Open until Retry-After, minimum 60s; default 60s | Yes |
| Resend explicit daily/monthly quota rejection | Same | Manual open; quota known exhausted | Yes |
| EmailJS explicit monthly quota 403 | Same | Manual open; quota known exhausted | Yes |
| HTTP 401 invalid credentials | Same | Manual open until administrator fixes | Yes |
| Mailjet explicit mj-0001 suspended key | failed | Manual open | No |
| Brevo explicit not_enough_credits rejection | Try next enabled provider | Manual open; quota known exhausted | Yes |
| Adapter detects missing credentials before submission | Skip without HTTP | Configuration unavailable | Yes |
| Provider excluded by enable flag or existing open circuit | Skip without HTTP | Existing state retained | Yes |
| Invalid address/content / HTTP 400, 404 or 422 | Reject input or failed delivery | Manual review for provider failures | No |
| HTTP 403 without documented monthly-quota rejection | failed; potential policy/suspension | Manual open | No: never evade abuse restrictions |
| Timeout/reset, malformed success, missing receipt, unexpected error | unknown | Temporary unavailable | NO |
| Generic 500/502/503/504 | unknown | Temporary unavailable | NO: an upstream may already have accepted |
| Worker interrupted with durable accepted attempt | Recover accepted with receipt | Existing | NO |
| Worker interrupted without durable acceptance | Recover unknown after 10 minutes | Existing | NO |

The request's conceptual 503 example is safe only with additional proof of non-acceptance. A status code alone is insufficient; current adapters deliberately do not assume it. A future documented pre-submission refusal can return unavailable_before_submit. Adapters cannot authorize fallback with arbitrary error strings. Unknown is terminal to automatic processing. The scheduler only selects pending records, never unknown/accepted/failed.

Quota is either unknown or known_exhausted after a documented provider rejection. There are no fictitious counters or guessed balances. Local accepted counts are activity statistics, not authoritative vendor quota. Rate-limit gates are local pacing facts, not a quota claim. Authentication/monthly quota circuits require explicit operator reset after correcting credentials or confirming renewed quota. Resetting a circuit does not reset delivery records. Open circuits are persisted and skip the next member, including another function instance.

Provider-side daily queues matter: [Brevo](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan), [SMTP2GO](https://support.smtp2go.com/hc/en-gb/articles/223087947-Free-Plan), [Mailjet](https://documentation.mailjet.com/hc/en-us/articles/19154256993051-Understanding-Mailjet-Free-Plan-Limits). A message accepted into one of these queues must not be resubmitted elsewhere because it has not arrived yet. Accepted messages can later bounce, expire or be suppressed; those are different delivery events.

## Webhook evaluation

Resend exposes delivered/bounced/complained events and signing support; Brevo transactional events, SMTP2GO webhooks, and Mailjet callback events are available with plan/account differences. See linked official pricing/API sources in the research. Webhooks would improve reconciliation but are not required for safe admission and at-most-once submission.

No webhook receiver is enabled in this change. A production receiver requires provider-specific signature/credential verification, replay-window protection, duplicate-event IDs, stable providerMessageId mapping and monotonic transitions. Bounce/complaint suppression must apply across every provider before future admissions. Until then, manage suppressions centrally in the approved member list, disable failing providers manually, and inspect vendor dashboards. Do not treat an unauthenticated callback or an open/click event as proof of delivery. Unknown reconciliation and automatic bounce/complaint ingestion are explicitly future work; keep volumes low and membership consent verified.
