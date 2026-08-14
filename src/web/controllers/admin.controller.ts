import { Controller, ForbiddenException, Get, Headers } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AdaptationEffectQuery,
  type AdaptationEffectReport,
} from '../../query/adaptation-effect.query';
import { Public } from '../security/public.decorator';

/**
 * Operator-only reads. No dashboard, no UI — curl is the interface, because
 * the moment this gets a screen someone starts quoting it as a metric.
 *
 * Disabled unless `ADMIN_TOKEN` is set, and then only to a caller who
 * presents it.
 */
@Controller('admin')
export class AdminController {
  constructor(
    private readonly config: ConfigService,
    private readonly adaptationEffect: AdaptationEffectQuery,
  ) {}

  /** Is the adaptive loop earning its place? */
  @Public()
  @Get('adaptation-effect')
  async effect(
    @Headers('x-admin-token') token?: string,
  ): Promise<AdaptationEffectReport> {
    const expected = this.config.get<string>('ADMIN_TOKEN');
    // Absent config means the endpoint does not exist, not that it is open.
    if (!expected || token !== expected) throw new ForbiddenException();
    return this.adaptationEffect.execute();
  }
}
