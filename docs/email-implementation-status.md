# Multi-provider implementation status

2026-10-29. Prepared on fix/email-delivery, extending draft PR #1. No main merge, production Functions deployment, billing upgrade, provider-account creation, credential provisioning or real email send was performed for this reconstruction.

## Implemented

Persistent private RTDB delivery queue; verified Firebase Auth administrator callables; normalized deterministic recipient identities; transactional reservation; permanent content fingerprint and receipt; provider message IDs; shared persistent circuits; shared provider pacing; pending recovery scheduler; crash-to-unknown recovery; conservative transport classification; manual single-recipient/provider tests; admin configuration, activity statistics and recipient logs; staged frontend integration for notices, events and reviews.

Mailjet primary for current no-owned-domain constraint, SMTP2GO optional reserve, Resend future domain-backed tertiary, EmailJS legacy. Brevo adapter prepared but terms/domain review required. All five are disabled by default. Only enable configured, verified accounts that GAIA legitimately owns; one principal account is enough for the calculated volume.

## Changed files in this reconstruction

- functions/package.json, functions/package-lock.json: pinned runtime dependencies and browser test dependency.
- functions/providers.js: five REST adapters and conservative response classification.
- functions/core.js: admission, authorization, router, recovery and reporting.
- functions/firebase-store.js: real transactional RTDB storage adapter.
- functions/index.js: authenticated callables, queue trigger and scheduler.
- functions/.env.example, functions/provider-secrets.example.json: configuration names and synthetic secret schema.
- firebase.json, firebase-email-routes.rules.json: deployment/emulator definition, private queue/indexes and permanent backend route protection.
- email-backend-config.js, email-backend.js, email-admin.js: public cutover switch, callable client and admin panel.
- index.html, notice-mail.js: explicit-action integration and stable delivery contexts; original antispam behavior preserved.
- tests/backend-email.test.cjs: mocked queue/router/provider/security regressions.
- tests/email-emulator.cjs: guarded demo-project RTDB transactions and browser-access rules integration.
- tests/email-backend-browser.cjs: fully intercepted browser workflow and output-escaping checks.
- .github/workflows/tests.yml: Node 22 regression, dependency audit, Java/emulators and browser validation.
- .gitignore, README.md, AGENTS.md: secret/log exclusions and entry points.
- docs/email-providers-research.md, docs/email-architecture.md, docs/email-failover.md, docs/email-setup.md, this document: research, costs, design, operations and evidence.

## Evidence and limits

- `node --test tests/*.test.cjs`: 50/50 passed locally on Node 24.19.0. Deployment/CI targets Node 22.
- `node tests/email-backend-browser.cjs`: passed locally in headless Edge with every network request intercepted; dashboard screenshot at test-results/email-system.png (ignored artifact).
- `npm audit --omit=dev --prefix functions`: zero reported vulnerabilities at installation/review time.
- Functions exports loaded without runtime network operations after changing the store to lazy initialization.
- `git diff --check`: clean (Windows line-ending warnings do not indicate whitespace failures).
- Firebase database/Auth emulator integration: configured in CI; not run locally because Java is unavailable. Check the workflow for the exact tested commit before deploying.
- f0fdc1608bba280a4bba6747bf12efe57b2e79fe remains in branch history, with the existing antispam regressions passing.

## Activation prerequisites and remaining work

Pedro must create/verify the selected provider account and sender, provision EMAIL_PROVIDER_SECRETS, and review Firebase Blaze billing before deployment. Gmail sender deliverability/account approval is not established by mocks. Full setup is in email-setup.md. Existing private Apps Script page still failed in Pedro's isolated test; its earlier self-test is not evidence that the new queue is deployed.

No webhook receiver or automatic bounce/complaint ingestion is enabled. Therefore accepted is the maximum status produced by a live adapter; delivered is reserved and zero unless later reconciliation is implemented. Native provider quota balances are unknown unless an explicit documented refusal proves exhaustion. Mailjet/SMTP2GO/Brevo daily provider queues cannot be treated as safe refusals. No automatic unknown resend or old-message import is offered.

Legacy gaia_v7 public read/write rules are an existing confirmed design problem, preserved in this patch rather than silently claiming the old portal login is secure. The new private root must remain outside it. Admission failures before the browser receives a durable result still require retrying the same stable request; this is not a guarantee that an unsubmitted browser request survives closing the browser.
