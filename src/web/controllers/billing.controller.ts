import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { CheckoutResponse, PortalResponse } from '../../contracts';
import {
  CancelSubscriptionHandler,
  ChangeIntervalHandler,
  OpenBillingPortalHandler,
  ResumeSubscriptionHandler,
} from '../../business/handlers/billing/manage-subscription.handlers';
import { HandleWebhookHandler } from '../../business/handlers/billing/handle-webhook.handler';
import {
  StartCheckoutHandler,
  StartCreditCheckoutHandler,
} from '../../business/handlers/billing/start-checkout.handler';
import { EntitlementsService } from '../../business/handlers/documents/entitlements.service';
import { CurrentUser } from '../security/current-user.decorator';
import { Public } from '../security/public.decorator';
import { BuyCreditsDto, StartCheckoutDto } from '../validation/billing.dto';

/**
 * Paying for Pro.
 *
 * Reading the current subscription lives on the account controller with the
 * rest of the account's state; this controller is only the things that
 * change money — which is why every route here except cancelling and the
 * gateway's own webhook refuses while BILLING_ENABLED is false. Hiding the
 * buttons is presentation; this is the part that cannot be bypassed by a
 * stale client or a curl.
 */
@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private readonly startCheckout: StartCheckoutHandler,
    private readonly startCreditCheckout: StartCreditCheckoutHandler,
    private readonly cancel: CancelSubscriptionHandler,
    private readonly changeInterval: ChangeIntervalHandler,
    private readonly resume: ResumeSubscriptionHandler,
    private readonly portal: OpenBillingPortalHandler,
    private readonly webhook: HandleWebhookHandler,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Post('checkout')
  @HttpCode(200)
  async checkout(
    @CurrentUser('id') userId: string,
    @Body() body: StartCheckoutDto,
  ): Promise<CheckoutResponse> {
    this.entitlements.assertBillingEnabled();
    const result = await this.startCheckout.handle({
      userId,
      interval: body.interval,
    });
    return result.data;
  }

  /** A one-time voice-minutes bundle; the webhook credits the wallet. */
  @Post('credits')
  @HttpCode(200)
  async buyCredits(
    @CurrentUser('id') userId: string,
    @Body() body: BuyCreditsDto,
  ): Promise<CheckoutResponse> {
    this.entitlements.assertBillingEnabled();
    const result = await this.startCreditCheckout.handle({
      userId,
      bundle: body.bundle,
    });
    return result.data;
  }

  /** Move an existing subscription between monthly and yearly. */
  @Post('interval')
  @HttpCode(204)
  async setInterval(
    @CurrentUser('id') userId: string,
    @Body() body: StartCheckoutDto,
  ): Promise<void> {
    this.entitlements.assertBillingEnabled();
    await this.changeInterval.handle({ userId, interval: body.interval });
  }

  /** Take back a cancellation that has not taken effect yet. */
  @Post('resume')
  @HttpCode(204)
  async resumeSubscription(@CurrentUser('id') userId: string): Promise<void> {
    this.entitlements.assertBillingEnabled();
    await this.resume.handle({ userId });
  }

  @Post('portal')
  @HttpCode(200)
  async openPortal(@CurrentUser('id') userId: string): Promise<PortalResponse> {
    this.entitlements.assertBillingEnabled();
    const result = await this.portal.handle({ userId });
    return result.data;
  }

  @Delete('subscription')
  @HttpCode(204)
  async cancelSubscription(@CurrentUser('id') userId: string): Promise<void> {
    await this.cancel.handle({ userId });
  }

  /**
   * The gateway's callback. Public by necessity and therefore signed: the
   * raw body is preserved by middleware in main.ts because re-serialising
   * the parsed JSON would break the signature.
   *
   * Always answers 200 once the signature checks out, including for events
   * we ignore. A non-2xx tells the gateway to retry, and retrying something
   * we deliberately skipped is noise forever.
   */
  @Public()
  @Post('webhook')
  @HttpCode(200)
  async receiveWebhook(
    @Req() request: Request,
  ): Promise<{ received: boolean }> {
    // Never re-serialise: a parsed body has already lost the exact bytes the
    // signature covers, and stringifying it back would verify only by luck.
    // If this is not a Buffer the raw-body middleware is no longer running
    // ahead of the JSON parser, which is a deployment fault worth shouting
    // about rather than papering over.
    if (!Buffer.isBuffer(request.body)) {
      this.logger.error(
        'Webhook body arrived parsed, not raw. The raw-body middleware for /api/v1/billing/webhook must be registered BEFORE express.json() in main.ts, or no signature can ever verify.',
      );
      return { received: false };
    }
    const raw = request.body;

    // The whole header map, lowercased: which header carries the signature
    // is the gateway adapter's business, not the route's.
    const headers: Record<string, string | undefined> = {};
    for (const [name, value] of Object.entries(request.headers)) {
      headers[name.toLowerCase()] = Array.isArray(value) ? value[0] : value;
    }

    const result = await this.webhook.handle({ rawBody: raw, headers });
    return { received: result.data.accepted };
  }
}
