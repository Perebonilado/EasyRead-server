export interface CheckoutSession {
  authorizationUrl: string;
  reference: string;
}

export interface GatewaySubscription {
  subscriptionCode: string;
  customerCode: string;
  status: 'active' | 'non_renewing' | 'attention' | 'cancelled' | 'expired';
  currentPeriodEnd: Date | null;
}

export interface PaymentsPort {
  initializeCheckout(input: {
    email: string;
    planCode: string;
    callbackUrl: string;
  }): Promise<CheckoutSession>;

  /** HMAC-SHA512 of the raw body; mandatory before any webhook is trusted. */
  verifyWebhookSignature(
    rawBody: Buffer,
    signature: string | undefined,
  ): boolean;

  fetchSubscription(
    subscriptionCode: string,
  ): Promise<GatewaySubscription | null>;

  disableSubscription(subscriptionCode: string): Promise<void>;
}
