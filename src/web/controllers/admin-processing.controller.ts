import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import type { ProcessingChannel, ProcessingStatusDto } from '../../contracts';
import { SetProcessingChannelsHandler } from '../../business/handlers/documents/set-processing-channels.handler';
import { ProcessingStatusQuery } from '../../query/processing-status.query';
import { AdminGuard } from '../security/admin.guard';
import { CurrentUser } from '../security/current-user.decorator';

class SetProcessingDto {
  @IsOptional()
  @IsIn(['openai', 'modal'])
  text?: ProcessingChannel;

  @IsOptional()
  @IsIn(['openai', 'modal'])
  audio?: ProcessingChannel;
}

/** Where a school's processing runs: read and changed by the admin. */
@Controller('admin/processing')
@UseGuards(AdminGuard)
export class AdminProcessingController {
  constructor(
    private readonly status: ProcessingStatusQuery,
    private readonly setChannels: SetProcessingChannelsHandler,
  ) {}

  @Get()
  async read(): Promise<ProcessingStatusDto> {
    return this.status.execute();
  }

  /** Takes effect on the next job the worker picks up. */
  @Patch()
  async change(
    @CurrentUser('id') userId: string,
    @Body() body: SetProcessingDto,
  ): Promise<ProcessingStatusDto> {
    await this.setChannels.handle({ userId, ...body });
    return this.status.execute();
  }
}
