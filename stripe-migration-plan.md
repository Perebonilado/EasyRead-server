# Stripe migration plan

EasiRead moves its payment gateway to Stripe. Third gateway on the same
`PaymentsPort`, so the shape of the work is one adapter plus copy — but
Stripe is a *processor*, not a merchant of record, which changes the
business prerequisites and the legal pages more than it changes the code.

## 0. The prerequisite that gates everything

Stripe requires the merchant to be an entity in a supported country;
Nigeria is not one. Two realistic routes:

- **Stripe Atlas** — Delaware C-corp or LLC, $500 one-time, includes the
  EIN and unlocks a US business bank (Mercury). 1–3 weeks end to end,
  most of it waiting on the EIN.
- **UK Ltd** — cheaper to register, non-resident directors are fine, but
  you need a UK business bank Stripe will pay out to (Wise Business
  works) and a UK accountant for the annual filing.

Either way, EasiRead becomes the seller of record. Paddle/Inflow carried
sales-tax and VAT compliance; with Stripe those obligations are yours.
Practically: US state thresholds (~$100k/state) are far away, EU VAT on
B2C digital sales technically applies from the first sale. Stripe Tax
can calculate and collect from day one and monitor thresholds; remitting
is still on you. Recommendation: launch tax-exclusive USD, turn on
Stripe Tax monitoring, revisit when revenue is real.

**Decision needed:** which entity route, and Stripe Tax now or later.

## 1. Catalogue (Stripe dashboard, test mode first)

One product "EasiRead Pro" with two recurring prices ($14/mo, $100/yr),
one product "Voice minutes" with three one-time prices ($5/$12/$25).
Five price ids into env, mirroring the Paddle/Inflow pattern:

    STRIPE_SECRET_KEY=sk_test_...
    STRIPE_WEBHOOK_SECRET=whsec_...
    STRIPE_PRICE_MONTHLY=price_...
    STRIPE_PRICE_YEARLY=price_...
    STRIPE_PRICE_MIN30=price_...   STRIPE_PRICE_MIN90=...   STRIPE_PRICE_MIN220=...
    PAYMENTS_PROVIDER=stripe

No publishable key: checkout is Stripe's hosted page, so the client
needs no Stripe.js and no new env at all.

## 2. The adapter (`stripe-payments.adapter.ts`)

Same fetch-based pattern as the other two, no SDK. One mechanical
difference: Stripe's API is form-encoded, not JSON, so `call()` needs a
small encoder for nested params (`items[0][price]=...`). Pin the API
version with a `Stripe-Version` header.

| Port method | Stripe call |
|---|---|
| `createCheckout` | `POST /v1/checkout/sessions` mode=subscription, `line_items[0][price]`, `client_reference_id=userId`, `metadata[userId]`, `subscription_data[metadata][userId]`, reuse `customer` when known else `customer_email`, success/cancel URLs → `{kind:'redirect', url}` |
| `createCreditCheckout` | Same, mode=payment, `metadata[userId]` + `metadata[creditSeconds]` |
| `verifyAndParseWebhook` | `stripe-signature: t=...,v1=...`; HMAC-SHA256 over `` `${t}.${rawBody}` `` hex, constant-time, 5-min tolerance; one event per delivery → array of one |
| `fetchSubscription` | `GET /v1/subscriptions/{id}` |
| `fetchCustomerEmail` | `GET /v1/customers/{id}` — the email attribution thread Inflow lacked comes back |
| `cancelSubscription` | `POST /v1/subscriptions/{id}` `cancel_at_period_end=true` |
| `resumeSubscription` | same, `cancel_at_period_end=false` |
| `changeInterval` | retrieve item id, then update `items[0][price]`; up to yearly `proration_behavior=always_invoice` (difference billed now), down to monthly `proration_behavior=none` (new price from next renewal — the paid year runs out first). Matches existing policy on both gateways. |
| `createPortalSession` | `POST /v1/billing_portal/sessions` → url. A real portal again. |

Status map (anything unknown → `expired`, never Pro by accident):
active→active, trialing→trialing, past_due→past_due, paused→paused,
canceled→cancelled, unpaid/incomplete/incomplete_expired→expired.
`cancel_at_period_end` maps directly. `current_period_end` is unix
seconds. Interval read off the price id, like the Paddle adapter.

## 3. Webhooks

Subscribe the endpoint (`/api/v1/billing/webhook`, raw-body middleware
already in place) to exactly four events:

- `checkout.session.completed` — mode=payment carries the credit
  purchase (`metadata.creditSeconds`), inline, no lookup.
- `customer.subscription.created` / `updated` / `deleted` — the whole
  subscription state, rewritten row-per-event as today.

Deliberately not subscribing to invoice.* — renewal and dunning already
surface as `subscription.updated` status changes, and fewer event types
is fewer failure modes.

**Ordering guard (new, small):** Stripe does not guarantee delivery
order, so a late `created` (status `incomplete`) must not overwrite an
applied `updated` (status `active`). Store the `occurredAt` of the last
applied event on the subscription row; skip any event older than it.
Benefits all three gateways.

Everything else holds from the existing design: idempotent claim by
event id, three-thread user attribution (metadata userId → known sub id
→ customer email, each existence-checked), loud log on signature
mismatch, reconcile handler as the safety net for missed deliveries.

## 4. Scenario coverage

**Happy paths**
1. New monthly sub · 2. New yearly sub · 3. Returning customer reuses
their Stripe customer (saved card) · 4. Each credit bundle tops the
wallet via webhook · 5. Renewal extends `current_period_end` ·
6. Upgrade monthly→yearly: difference invoiced immediately ·
7. Downgrade yearly→monthly: takes effect at renewal · 8. Cancel: Pro
until period end, then `deleted` event drops the row · 9. Resume before
period end · 10. Portal: update card, view invoices.

**Failures and edges**
11. Card declined at checkout — no subscription exists until success;
user just retries. 12. Abandoned session — expires in 24h, no event we
act on. 13. Renewal fails — `past_due` (access retained by design,
`planFor` counts it live), Smart Retries run; configure "cancel
subscription" as the final dunning action so exhaustion emits `deleted`
→ Free. 14. 3DS challenge on renewal — Stripe emails the hosted
confirmation link; state rides the same statuses. 15. Missed webhook —
Stripe retries ~3 days; reconcile handler corrects staleness anyway.
16. Replayed webhook — claimed once by event id. 17. Out-of-order —
ordering guard above. 18. Forged/mis-secreted webhook — refused with the
loud log. 19. Cross-environment test events — existence checks already
drop them. 20. Refund — manual from the dashboard first (14-day policy);
`charge.refunded` handling and wallet clawback can come later.
21. Dispute — dashboard alert, respond manually; non-issue at $14 until
it isn't. 22. Account deletion with a live subscription — **gap to
close**: soft-delete should call `cancelSubscription` so nobody pays for
a deleted account. 23. `BILLING_ENABLED=false` — checkout endpoints
refuse, cancel + webhook stay open; unchanged and correct.

## 5. Client changes (small)

- The `?checkout=success` return handler built for Inflow works as-is.
- Copy: billing page + pricing fine print say Stripe; **legal pages
  reworded, not just renamed** — EasiRead (the new entity) is the
  seller, Stripe processes; statement descriptor `EASIREAD`.
- Portal button on `/billing` goes live again (portal config in
  dashboard: payment method + invoices only; cancel/switch stay in-app
  as the single management surface).

## 6. Testing

- Adapter spec with real signature vectors (mirrors the other two),
  status-map matrix, and form-encoding assertions.
- Local: `stripe listen --forward-to localhost:4000/api/v1/billing/webhook`.
- Test cards: 4242… (success), 4000 0025 0000 3155 (3DS),
  4000 0000 0000 9995 (decline).
- **Test clocks** to simulate a renewal and a failed renewal without
  waiting a month — dunning path proven before launch.
- Full e2e in test mode: subscribe, switch both directions, cancel,
  resume, buy each bundle, portal.

## 7. Rollout order

1. Build adapter + guard + specs; e2e in test mode (needs nothing from
   Stripe activation — test mode works pre-verification).
2. Entity + Stripe activation (the long pole — start now).
3. Live: catalogue re-created in live mode, live keys + webhook secret
   on Railway, `PAYMENTS_PROVIDER=stripe`, legal copy deployed.
4. First real $14 self-purchase, then refund it: proves charge, webhook,
   Pro grant, and the refund path in one pass.

No subscriber migration: there are no existing subscribers. The
`provider` column keeps any old sandbox rows distinct, and the Paddle
and Inflow adapters stay in the tree — they cost nothing and remain the
rollback story.

## Decisions needed

1. Entity route: Atlas (US) or UK Ltd?
2. Stripe Tax at launch, or monitor-later?
3. Portal scope: card+invoices only (recommended) or allow cancel there too?
