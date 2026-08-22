import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
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
import { CurrentUser } from '../security/current-user.decorator';
import { Public } from '../security/public.decorator';
import { BuyCreditsDto, StartCheckoutDto } from '../validation/billing.dto';

/**
 * Paying for Pro.
 *
 * Reading the current subscription lives on the account controller with the
 * rest of the account's state; this controller is only the things that
 * change money.
 */
@Controller('billing')
export class BillingController {
  constructor(
    private readonly startCheckout: StartCheckoutHandler,
    private readonly startCreditCheckout: StartCreditCheckoutHandler,
    private readonly cancel: CancelSubscriptionHandler,
    private readonly changeInterval: ChangeIntervalHandler,
    private readonly resume: ResumeSubscriptionHandler,
    private readonly portal: OpenBillingPortalHandler,
    private readonly webhook: HandleWebhookHandler,
  ) {}

  @Post('checkout')
  @HttpCode(200)
  async checkout(
    @CurrentUser('id') userId: string,
    @Body() body: StartCheckoutDto,
  ): Promise<CheckoutResponse> {
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
    await this.changeInterval.handle({ userId, interval: body.interval });
  }

  /** Take back a cancellation that has not taken effect yet. */
  @Post('resume')
  @HttpCode(204)
  async resumeSubscription(@CurrentUser('id') userId: string): Promise<void> {
    await this.resume.handle({ userId });
  }

  @Post('portal')
  @HttpCode(200)
  async openPortal(@CurrentUser('id') userId: string): Promise<PortalResponse> {
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
    @Headers('paddle-signature') paddleSignature?: string,
  ): Promise<{ received: boolean }> {
    const raw = Buffer.isBuffer(request.body)
      ? request.body
      : Buffer.from(JSON.stringify(request.body ?? {}));

    const result = await this.webhook.handle({
      rawBody: raw,
      signature: paddleSignature,
    });
    return { received: result.data.accepted };
  }
}
