import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Public } from '../security/public.decorator';

/**
 * Liveness for the platform's health check.
 *
 * Deliberately shallow: it answers "can this instance serve a request and
 * reach its database", not "is the whole system well". A health check that
 * also pings Redis, the models and storage would take a slow dependency and
 * turn it into a restart loop of an otherwise healthy API.
 */
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly db: Sequelize) {}

  @Public()
  @Get()
  async check(): Promise<{ status: 'ok'; database: 'up' }> {
    await this.db.query('SELECT 1');
    return { status: 'ok', database: 'up' };
  }
}
