import type {
  BillingInterval,
  PlanCode,
  SubscriptionStatus,
} from '../../contracts';
import type { CreditBundle } from '../domain/values';

/**
 * How the client opens checkout: a hosted page to send the customer to.
 *
 * The gateway's own page collects the card, so no payment script and no
 * card field ever exists in our client — which is most of what keeps this
 * integration out of PCI scope.
 */
export interface CheckoutIntent {
  url: string;
}

/** A subscription as this codebase understands it, whoever is billing it. */
export interface GatewaySubscription {
  providerSubscriptionId: string;
  providerCustomerId: string | null;
  planCode: PlanCode;
  interval: BillingInterval | null;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  /** Cancelled but still inside the period already paid for. */
  cancelAtPeriodEnd: boolean;
}

/**
 * A verified webhook, already normalised.
 *
 * `subscription` is absent for events that carry no subscription state
 * (a one-off transaction receipt, say); the handler ignores those rather
 * than guessing.
 */
export interface GatewayWebhookEvent {
  /** The provider's own event id, for idempotent replay protection. */
  id: string;
  type: string;
  occurredAt: Date;
  /** Our user id, round-tripped through the gateway's custom data. */
  userId: string | null;
  subscription: GatewaySubscription | null;
  /** Set on a completed credit purchase: the seconds to add to the wallet. */
  creditSeconds: number | null;
}

/**
 * Everything the app needs from a payment gateway, in the app's own words.
 *
 * Deliberately free of any gateway's vocabulary. EasiRead has already been
 * through three of them — Paddle, then Inflow, now Stripe — and each move
 * cost one adapter and no changes above this line. That is the whole point
 * of the interface; keep it that way.
 */
export interface PaymentsPort {
  /** Recorded on the subscription row, so a migration can tell rows apart. */
  readonly provider: string;

  createCheckout(input: {
    userId: string;
    email: string;
    interval: BillingInterval;
    /** Reuse the gateway's customer when we have already seen this user. */
    providerCustomerId: string | null;
  }): Promise<CheckoutIntent>;

  /** A one-time purchase of voice credits, credited by the webhook. */
  createCreditCheckout(input: {
    userId: string;
    email: string;
    bundle: CreditBundle;
    providerCustomerId: string | null;
  }): Promise<CheckoutIntent>;

  /**
   * Verifies the signature over the RAW body and parses the result.
   *
   * Takes the whole (lowercased) header map because gateways disagree on
   * where the signature lives. Returns null when the signature does not
   * check out, so a caller that forgets to verify cannot exist; a verified
   * body yields an array because some gateways batch several events into
   * one delivery. Async because attributing an event can take a lookup.
   */
  verifyAndParseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): Promise<GatewayWebhookEvent[] | null>;

  fetchSubscription(
    providerSubscriptionId: string,
  ): Promise<GatewaySubscription | null>;

  /**
   * The email behind a gateway customer, as an attribution fallback: when a
   * webhook arrives carrying neither our user id nor a subscription we have
   * seen before, the customer's email is the one thread left to pull.
   */
  fetchCustomerEmail(providerCustomerId: string): Promise<string | null>;

  /** Cancels at the end of the paid period, never mid-period. */
  cancelSubscription(providerSubscriptionId: string): Promise<void>;

  /**
   * Moves an existing subscription between monthly and yearly.
   *
   * Returns the gateway's updated view so the row can be corrected at once
   * rather than waiting on the webhook that follows.
   */
  changeInterval(
    providerSubscriptionId: string,
    interval: BillingInterval,
  ): Promise<GatewaySubscription | null>;

  /** Clears a pending cancellation, so the subscription renews after all. */
  resumeSubscription(
    providerSubscriptionId: string,
  ): Promise<GatewaySubscription | null>;

  /** The gateway's own card/invoice page, or null if it has none. */
  createPortalSession(providerCustomerId: string): Promise<string | null>;
}
