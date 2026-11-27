# Deployment decision update

2026-10-29: live Firebase console confirmed Spark; Pedro declined Blaze and selected a free backend. Cloudflare Workers + D1 is now selected. Limits, account access and current status are in [the free setup](email-cloudflare-setup.md); the earlier conditional Firebase recommendation below is superseded. Provider ranking remains Mailjet primary without an owned domain.

# Email provider research

Reviewed 2026-10-29. Prices in USD, monthly billing, excluding taxes, DNS/domain registration and compute. UNKNOWN means not established by the cited official material; absence of a published limit is not unlimited capacity. This is an operational comparison, not a measured inbox-placement benchmark.

## Commercial comparison

| Provider | Free allowance | Daily / hourly limit | First paid option | Principal limitation |
|---|---|---|---|---|
| [EmailJS](https://www.emailjs.com/pricing/) | 200 requests/month | Hourly UNKNOWN; REST 1 request/s | $9/month, 2,000 requests | Connected mailbox has additional limits; browser public keys are not private API credentials |
| [Resend](https://resend.com/pricing) | 3,000/month | 100/day; hourly UNKNOWN; account API rate limit applies | $20/month, 50,000 | Verified owned sending domain for production recipients; test sender restricted |
| [Brevo](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans) | 300/day, not a monthly allocation | 300/day; transactional hourly restrictions can depend on account approval/reputation (UNKNOWN for GAIA) | Starter advertised from $9/month, 5,000; confirm checkout | Daily overflow may be ACCEPTED INTO PROVIDER QUEUE, not rejected |
| [SMTP2GO](https://www.smtp2go.com/pricing/) | 1,000/month | 200/day; 25/hour without verified domain | Page body $10/month, 10,000; page title says $15: verify checkout | Daily/hourly overflow is queued; monthly exhausted requests rejected |
| [SendGrid](https://www.twilio.com/en-us/products/email-api/pricing) | Trial only: 100/day for 60 days | 100/day during trial; hourly/account limits UNKNOWN | $19.95/month | No permanent free tier for new accounts; sender/account verification |
| [Mailgun](https://www.mailgun.com/pricing/) | 100/day | 100/day; hourly/account API limits UNKNOWN | $15/month, 10,000 | Own sending domain; free log retention only 1 day |
| [Postmark](https://postmarkapp.com/pricing) | 100/month for testing/low volume | Hourly UNKNOWN; paid no daily cap advertised | $15/month, 10,000 | Free volume insufficient; sender approval; transaction/broadcast streams distinct |
| [Elastic Email](https://elasticemail.com/email-api-pricing) | 3,000/month | 100/day; hourly UNKNOWN | $19/month, 50,000 | Confirm free account activation; webhooks listed in Pro, not assumed free |
| [Amazon SES](https://aws.amazon.com/ses/pricing/) | New-customer general AWS credits, not permanent SES free allocation | Sandbox 200/24h, 1/s; production account/region quotas | Essentials $0.16/1,000; existing eligible accounts can retain a-la-carte $0.10/1,000 | Production-access approval, regional quotas, AWS billing complexity |
| [Gmail API](https://developers.google.com/workspace/gmail/api/reference/quota) | No separate ESP monthly free plan | Standard mailbox limits; consumer commonly 500/day; API quota units are separate, account-dependent | Workspace subscription, not an email-send tier (price UNKNOWN here) | OAuth consent/verification, mailbox abuse limits; API quotas do not guarantee sending allowance |
| [Mailjet](https://documentation.mailjet.com/hc/en-us/articles/19154256993051-Understanding-Mailjet-Free-Plan-Limits) | 6,000/month | 200/day; hourly UNKNOWN | Starter $9/month, 8,000; Essential $19/month, 15,000 | Daily overflow queued up to 3 days; 1,000 stored contacts free |

SMTP2GO limits: [Free Plan](https://support.smtp2go.com/hc/en-gb/articles/223087947-Free-Plan), [migration FAQ](https://support.smtp2go.com/hc/en-gb/articles/12922807451289-Migrating-to-SMTP2GO-FAQ). Brevo queue behavior: [Free limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan). SES changed new-customer free tier in July 2026: [official announcement](https://aws.amazon.com/blogs/messaging-and-targeting/introducing-amazon-simple-email-service-ses-pricing-plans/). Mailjet updated prices: [September 2026 update](https://documentation.mailjet.com/hc/en-us/articles/25750983876763-Mailjet-Subscription-Pricing-Update-September-9-2026). Gmail mailbox limits: [consumer help](https://support.google.com/mail/answer/22839?hl=en), [error semantics](https://developers.google.com/workspace/gmail/api/guides/handle-errors).

## Technical and operational comparison

All listed services support transactional email. For Resend, Brevo, SMTP2GO, SendGrid, Mailgun, Postmark, Elastic Email, SES and Mailjet: REST and SMTP are available; use backend credentials only. CORS permission would not make exposing their keys safe. Gmail supports REST with user OAuth; Gmail SMTP is a separate authenticated transport. Browser OAuth is technically possible but unsuitable for unattended queue processing. EmailJS explicitly supports browser templates/public keys and a REST/Node path; it relays through a connected service rather than supplying a separate GAIA-owned SMTP relay.

| Provider | JavaScript/Node integration | Sender/domain | SPF, DKIM, DMARC | Webhooks / tracking | Setup and deliverability considerations |
|---|---|---|---|---|---|
| EmailJS | Browser SDK, Node SDK, REST | Verify connected mailbox; own domain optional | Inherited from connected mail service | Dashboard history/analytics; delivery webhook not established | Easiest legacy setup; mailbox quota remains; acceptance is not delivery |
| Resend | Official Node SDK; implementation uses REST | Owned verified domain required for unrestricted production; custom domain supported | Provider DNS setup; align DKIM/SPF and DMARC | Email delivery/bounce/complaint events; open/link tracking | Simple API, native 24h idempotency, good fit for small serverless apps; inbox rate NOT_MEASURED |
| Brevo | Official Node/TypeScript SDK; REST | Verified sender; owned domain strongly required for reliable identity; free-mail domains cannot be authenticated | DKIM/DMARC; shared SPF infrastructure, do not blindly add SPF/MX | Transactional events and tracking | Account activation/branding and deferred queue; use separate provider subdomain when required by domain setup guidance |
| SMTP2GO | REST; Node library availability/version not independently verified | Verified domain OR single sender required; custom domains supported | Verified domain handles SPF/DKIM via provider DNS; align DMARC | Webhooks and opens/clicks/bounces; 1 webhook free | Easier without own domain but 25/hour applies; daily accepted backlog must not fail over |
| SendGrid | Official Node SDK, REST | Single sender for tests or domain authentication | SPF/DKIM domain authentication; DMARC alignment | Event webhook, open/click/bounce tracking | Mature tooling; account vetting and trial expiration; inbox rate NOT_MEASURED |
| Mailgun | Official Node SDK, REST | Custom verified domain; sandbox restricted to authorized recipients | SPF/DKIM; publish aligned DMARC | Webhooks, tracking, analytics | Good API; very short free log retention, production domain setup |
| Postmark | Official Node SDK, REST | Sender signature or verified domain | DKIM; custom return path for aligned SPF; DMARC | Delivery/bounce/complaint/open/click webhooks | Strong transactional focus; no independent GAIA deliverability measurement |
| Elastic Email | Official JS client/REST | Verified sender/domain; confirm account requirements | SPF/DKIM/DMARC setup | Tracking; webhook plan availability matters | Attractive free volume, plan/approval limits need confirmation |
| SES | AWS SDK for JavaScript v3, REST | Verified identity; sandbox also verifies recipients | Easy DKIM/SPF custom MAIL FROM/DMARC | SNS/EventBridge/configuration-set events; optional tracking/VDM | Lowest unit cost; highest operational overhead here |
| Gmail API | Google Node client, REST | OAuth mailbox, verified send-as aliases; own domain optional | Gmail manages gmail.com authentication; Workspace custom DNS if applicable | Pub/Sub mailbox changes, not an ESP delivered webhook; no native open tracker | OAuth lifecycle and mailbox reputation unsuitable as default failover backbone |
| Mailjet | Official Node client, REST | Verified sender or domain | SPF/DKIM and aligned DMARC | Event webhooks and tracking | Generous permanent free allocation; queued daily overflow |

API evidence for implemented adapters: [EmailJS send](https://www.emailjs.com/docs/rest-api/send/), [Resend send](https://resend.com/docs/api-reference/emails/send-email), [Resend errors](https://resend.com/docs/api-reference/errors), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Brevo send](https://developers.brevo.com/reference/send-transac-email), [Brevo rate limits](https://developers.brevo.com/docs/api-limits), [SMTP2GO send](https://developers.smtp2go.com/docs/send-an-email), [SMTP2GO errors](https://developers.smtp2go.com/docs/response-codes).

Domain evidence: [Brevo authentication](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC), [Brevo domain separation](https://help.brevo.com/hc/en-us/articles/35852083084178-Domain-setup-for-better-email-deliverability), [SMTP2GO verified senders](https://support.smtp2go.com/hc/en-gb/articles/115004408567-Verified-Senders). Provider-specific SDK, security and webhook details for unimplemented services remain a pre-activation verification checklist, not tested integration claims.

## Terms and acceptable use

No extra accounts will be created to multiply a service's free allowance. Never route around abuse suspensions, suppression lists, complaints or invalid-recipient rejection. All recipients must be active consenting GAIA members; administrative messages are not permission for unsolicited marketing.

| Service | Official terms examined / result | Activation decision |
|---|---|---|
| [EmailJS](https://www.emailjs.com/legal/terms-of-service/) | Explicitly forbids multiple free accounts and unsolicited mail; no explicit independent-provider failover prohibition identified | Existing single account only |
| [Resend](https://resend.com/legal/acceptable-use) | Anti-abuse restrictions; no explicit independent-provider availability failover prohibition identified | Eligible subject to verified account/domain and consent |
| [Brevo](https://www.brevo.com/legal/termsofuse/) | Official page returned only an iframe; terms could not be fully evaluated | REVIEW_REQUIRED before enabling; adapter remains disabled by default |
| [SMTP2GO](https://www.smtp2go.com/terms/) | Requires relationship/member/opt-in recipients; no explicit independent-provider failover prohibition identified | Eligible subject to sender/account verification |
| [SendGrid/Twilio](https://www.twilio.com/en-us/legal/aup) | Anti-abuse and unsolicited-message restrictions; no explicit independent-provider failover ban identified | Not implemented; complete account-specific review before activation |
| [Mailgun](https://www.mailgun.com/legal/aup/) | Anti-spam policy; no explicit independent-provider failover ban identified | Not implemented; pre-activation review |
| [Postmark](https://postmarkapp.com/terms-of-service) | Acceptable-use restrictions; no explicit independent-provider failover ban identified | Not implemented; separate broadcast streams if required |
| [Elastic Email](https://elasticemail.com/resources/usage-policies/terms-of-use) | Anti-abuse obligations; no explicit independent-provider failover ban identified | Not implemented; pre-activation review |
| [SES/AWS](https://aws.amazon.com/aup/) | No spam/abuse; no explicit independent-provider failover ban identified | Not implemented; production approval required |
| Gmail API | OAuth/user-data policies require separate scope/consent review; complete policy verification UNKNOWN | Not selected for new backend |
| [Mailjet AUP](https://www.mailjet.com/legal/sending-policy/) / [terms](https://www.mailjet.com/legal/terms/) | One free account per platform; unsolicited/abusive sending prohibited; no independent-provider availability failover prohibition identified. Professional/institutional use must match the agreement | Selected after user confirmed no owned domain; account approval and verified sender still required |

Absence of an identified prohibition is not an affirmative contractual guarantee. Any prohibited configuration must be excluded. Enable each provider only after the administrator accepts its applicable current terms. Brevo domain guidance recommends provider separation; configure a separate authenticated sending subdomain rather than assuming a shared sender works everywhere.

## GAIA ranking and volume

User confirmed on 2026-10-29 that GAIA has only GitHub Pages, no owned DNS domain. Final recommendation for this actual constraint: **primary Mailjet**, **secondary SMTP2GO**, **tertiary Resend only after obtaining an authorized sending domain**, **legacy EmailJS**. Brevo adapter is available for a future domain/terms-reviewed configuration, disabled by default. The initial domain-owning shortlist (Resend/Brevo/SMTP2GO) is not the current activation recommendation.

Mailjet supports [verified individual senders](https://documentation.mailjet.com/hc/en-us/articles/360042561594-How-to-validate-an-entire-sending-domain) and [API-key authenticated REST](https://dev.mailjet.com/docs/email-api/getting-started/send-first-email). This does not mean GAIA can publish SPF/DKIM/DMARC for gmail.com or github.io: it cannot. A verified Gmail sender may encounter DMARC rewriting/filtering and account onboarding restrictions; production deliverability must be checked manually, not promised. If sender approval or delivery fails, obtain a university-authorized subdomain or a GAIA-owned domain before production. Do not forge a github.io mailbox. Start with ONE active provider: Mailjet's allowance already fits all scenarios. No measured deliverability ranking is claimed.

Calculated using 52/12 weeks/month; round up for capacity planning. Each member/address is one email. Other categories and tests add volume.

| Scenario | Expected monthly sends | Peak from one notice | Resend Free | Brevo Free | SMTP2GO Free | Mailjet Free |
|---|---:|---:|---|---|---|---|
| 50 members, 1/week | 217 | 50 | $0 | $0 | $0 | $0 |
| 50 members, 3/week | 650 | 50 | $0 if <=100/day | $0 | $0 | $0 |
| 50 members, 1/day | 1,522 (365.25/12 days) | 50 | $0 | $0 | Exceeds 1,000 | $0 |
| 100 members, 3/week | 1,300 | 100 | $0, no same-day headroom | $0 | Exceeds 1,000 | $0 |

For a 31-day calendar month, daily scenario is 1,550. Resend alone fits all scenarios if daily limits are respected. Multiple free plans are not needed to satisfy these average loads. SMTP2GO paid quote is ambiguous ($10 body / $15 title), so budget $15 pending checkout rather than promising $10. EmailJS 200/month is insufficient for all four conservative rounded scenarios. SES Essentials base estimates: $0.03472 / $0.104 / $0.24352 / $0.208 respectively, plus data, compute and taxes; this is not an all-in bill.

## Serverless comparison and decision

| Platform | Current official source | Fit/constraints |
|---|---|---|
| Firebase Functions | [Pricing](https://firebase.google.com/pricing), [scheduler](https://firebase.google.com/docs/functions/schedule-functions), [secrets](https://firebase.google.com/docs/functions/config-env) | Requires Blaze/billing; no-cost usage allowances are not a guaranteed $0 bill. Direct Admin SDK/RTDB/Auth integration; selected to avoid a second database/identity stack |
| Cloudflare Workers | [Pricing](https://developers.cloudflare.com/workers/platform/pricing/) | Free 100,000 requests/day; paid from $5/month. Would require a separate durable queue/transaction store and verified Firebase token bridge; viable later if no Blaze authorization |
| Vercel Functions | [Hobby](https://vercel.com/docs/plans/hobby) | Free personal/noncommercial limits; needs external durable store and scheduler; cannot depend on an HTTP function staying alive after response |
| Netlify Functions | [Pricing](https://www.netlify.com/pricing/) | Credit-metered free tier; finite execution/storage/credit limits, separate durable queue required; no unlimited-free claim |
| Supabase Edge Functions | [Pricing](https://supabase.com/pricing) | Free tier and Postgres queue possible; free projects pause after inactivity, Pro starts $25; introduces another database/Auth boundary |

Firebase choice is conditional on Pedro approving billing in his console. No billing upgrade, new account, paid subscription, domain purchase or production deployment is performed by this change. Compute costs are UNKNOWN until deployed/account billing is reviewed; use budget alerts (not hard spending caps), maxInstances and small bounded batches. Existing Apps Script private deployment failure is not a dependency of this design.
