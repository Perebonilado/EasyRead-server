import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import type { SceneVoiceStatusDto, VoiceOptionDto } from '../../contracts';
import { SceneVoiceService } from '../../business/handlers/admin/scene-voice.service';
import {
  SCENE_VOICE_ENGINES,
  VOICE_ROLES,
  type SceneVoiceEngine,
  type VoiceRole,
} from '../../business/domain/scene-voice';
import { AdminGuard } from '../security/admin.guard';
import { CurrentUser } from '../security/current-user.decorator';

class SetSceneVoiceDto {
  /** An engine, or null for the deployment's own. */
  @IsOptional()
  @IsIn([...SCENE_VOICE_ENGINES])
  engine?: SceneVoiceEngine | null;
}

class SetVoiceCastDto {
  /** The narrator, or a kind of character. */
  @IsIn([...VOICE_ROLES])
  role!: VoiceRole;

  /** An ElevenLabs voice id, or null for the default. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{12,40}$/)
  voice?: string | null;
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

  /** The voices ElevenLabs offers this account, to give the narrator and each kind of character. */
  @Get('voice/elevenlabs-voices')
  async elevenLabsVoices(): Promise<{ voices: VoiceOptionDto[] }> {
    return { voices: await this.voices.voiceOptions() };
  }

  /** The narrator's or a kind of character's ElevenLabs voice; null for the default. */
  @Patch('voice/cast')
  async setCast(
    @CurrentUser('id') userId: string,
    @Body() body: SetVoiceCastDto,
  ): Promise<SceneVoiceStatusDto> {
    return this.voices.chooseCast(body.role, body.voice ?? null, userId);
  }
}
