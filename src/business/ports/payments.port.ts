import type {
  BillingInterval,
  PlanCode,
  SubscriptionStatus,
} from '../../contracts';

/**
 * How the client opens checkout.
 *
 * Paddle mints a transaction its in-page overlay opens; Stripe returns a
 * hosted URL to redirect to. Both shapes live here so the gateway can be
 * swapped without the client learning a new contract.
 */
export type CheckoutIntent =
  | { kind: 'overlay'; transactionId: string }
  | { kind: 'redirect'; url: string };

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
}

/**
 * Everything the app needs from a payment gateway, in the app's own words.
 *
 * Deliberately free of Paddle vocabulary: EasiRead launches on Paddle
 * because it is a merchant of record and takes sellers outside Stripe's
 * supported countries, and is expected to move to Stripe once a US entity
 * exists. Only the adapter should have to change.
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

  /**
   * Verifies the signature over the RAW body and parses the result. Returns
   * null when the signature does not check out, so a caller that forgets to
   * verify cannot exist.
   */
  verifyAndParseWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): GatewayWebhookEvent | null;

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
