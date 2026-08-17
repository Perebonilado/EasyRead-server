import { Controller, Get, Inject, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { TutorDto } from '../../contracts';
import { TUTORS } from '../../business/domain/values/tutors';
import { TutorIntroHandler } from '../../business/handlers/tutors/tutor-intro.handler';
import { STORAGE } from '../../business/ports/tokens';
import type { StoragePort } from '../../business/ports/storage.port';
import { Public } from '../security/public.decorator';

/**
 * The tutor roster for the picker. The list is public and static — the
 * persona prompts deliberately never leave the server, only what a card
 * needs. The intro audio stays behind auth: it is the one route here that
 * can spend money (a TTS call on first request).
 */
@Controller('tutors')
export class TutorsController {
  constructor(
    private readonly tutorIntro: TutorIntroHandler,
    @Inject(STORAGE) private readonly storage: StoragePort,
  ) {}

  @Public()
  @Get()
  list(): TutorDto[] {
    return TUTORS.map((tutor) => ({
      id: tutor.id,
      name: tutor.name,
      tagline: tutor.tagline,
      description: tutor.description,
      color: tutor.color,
      dials: tutor.dials,
      // The picker marks these: a studio-grade voice that costs more to run.
      premiumVoice: tutor.voice.provider === 'elevenlabs',
    }));
  }

  /** The tutor introducing themself, in their own voice. */
  @Get(':id/intro')
  async intro(
    @Param('id') tutorId: string,
    @Res() response: Response,
  ): Promise<void> {
    const { data } = await this.tutorIntro.handle({ tutorId });

    const { stream, size } = await this.storage.stream(data.fileRef);
    response.setHeader('Content-Type', data.mimeType);
    response.setHeader('Content-Length', size);
    // Immutable for its key — the key changes when the script or voice does.
    response.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    stream.pipe(response);
  }
}
