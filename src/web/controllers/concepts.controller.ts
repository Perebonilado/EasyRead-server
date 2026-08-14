import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { CONCEPT_REPOSITORY } from '../../business/repositories/tokens';
import type { ConceptKnowledgeRepository } from '../../business/repositories/concept.repository';
import { DocumentAccessService } from '../../business/handlers/documents/document-access.service';
import { CurrentUser } from '../security/current-user.decorator';

class ConceptDto {
  @IsString()
  @Length(2, 300)
  concept!: string;
}

/**
 * The tutor's write into the concept ledger: after a prerequisite detour in a
 * lesson, the concept is marked taught so it stops appearing in strips and
 * stops being asked about. The chat writes its own entries server-side; this
 * route exists because lesson tools execute in the browser.
 */
@Controller('documents/:id/concepts')
export class ConceptsController {
  constructor(
    @Inject(CONCEPT_REPOSITORY)
    private readonly concepts: ConceptKnowledgeRepository,
    private readonly access: DocumentAccessService,
  ) {}

  @Post('taught')
  @HttpCode(204)
  async taught(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: ConceptDto,
  ): Promise<void> {
    await this.access.require(documentId, userId);
    await this.concepts.markTaught(userId, body.concept, documentId);
  }
}
