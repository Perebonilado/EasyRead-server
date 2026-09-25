import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import type { SceneVoiceStatusDto } from '../../contracts';
import { SceneVoiceService } from '../../business/handlers/admin/scene-voice.service';
import {
  SCENE_VOICE_ENGINES,
  type SceneVoiceEngine,
} from '../../business/domain/scene-voice';
import { AdminGuard } from '../security/admin.guard';
import { CurrentUser } from '../security/current-user.decorator';

class SetSceneVoiceDto {
  /** An engine, or null for the deployment's own. */
  @IsOptional()
  @IsIn([...SCENE_VOICE_ENGINES])
  engine?: SceneVoiceEngine | null;
}

/** What the admin switches while the app runs: Visualize's voice. */
@Controller('admin/settings')
@UseGuards(AdminGuard)
export class AdminSettingsController {
  constructor(private readonly voices: SceneVoiceService) {}

  @Get('voice')
  async voice(): Promise<SceneVoiceStatusDto> {
    return this.voices.status();
  }

  /** Takes effect on the next page the worker voices, within seconds. */
  @Patch('voice')
  async setVoice(
    @CurrentUser('id') userId: string,
    @Body() body: SetSceneVoiceDto,
  ): Promise<SceneVoiceStatusDto> {
    return this.voices.choose(body.engine ?? null, userId);
  }
}
