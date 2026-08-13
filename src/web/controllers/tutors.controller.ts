import { Controller, Get } from '@nestjs/common';
import type { TutorDto } from '../../contracts';
import { TUTORS } from '../../business/domain/values/tutors';
import { Public } from '../security/public.decorator';

/**
 * The tutor roster for the picker. Public and static — the persona prompts
 * deliberately never leave the server, only what a card needs.
 */
@Controller('tutors')
export class TutorsController {
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
    }));
  }
}
