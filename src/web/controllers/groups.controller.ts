import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import type {
  GroupDetailDto,
  GroupSummaryDto,
  StudySessionDto,
} from '../../contracts';
import {
  CreateGroupHandler,
  EndSessionHandler,
  GroupDetailHandler,
  JoinGroupHandler,
  ListGroupsHandler,
  RegenerateCodeHandler,
  RemoveMemberHandler,
  StartSessionHandler,
} from '../../business/handlers/groups/groups.handlers';
import { DocumentAccessService } from '../../business/handlers/documents/document-access.service';
import { SessionGateway } from '../gateways/session.gateway';
import { GROUP_REPOSITORY } from '../../business/repositories/tokens';
import type { GroupRepository } from '../../business/repositories/group.repository';
import { CurrentUser } from '../security/current-user.decorator';

class CreateGroupDto {
  @IsString()
  @Length(1, 80)
  name!: string;
}

class JoinGroupDto {
  @IsString()
  @Length(4, 16)
  code!: string;
}

class StartSessionDto {
  @IsUUID()
  documentId!: string;

  @IsOptional()
  @IsUUID()
  topicId?: string;

  @IsString()
  @Length(1, 40)
  tutorId!: string;
}

@Controller('groups')
export class GroupsController {
  constructor(
    private readonly createGroup: CreateGroupHandler,
    private readonly joinGroup: JoinGroupHandler,
    private readonly listGroups: ListGroupsHandler,
    private readonly groupDetail: GroupDetailHandler,
    private readonly regenerateCode: RegenerateCodeHandler,
    private readonly removeMember: RemoveMemberHandler,
    private readonly startSession: StartSessionHandler,
    private readonly endSession: EndSessionHandler,
    private readonly access: DocumentAccessService,
    private readonly gateway: SessionGateway,
    @Inject(GROUP_REPOSITORY) private readonly groups: GroupRepository,
  ) {}

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser('id') userId: string,
    @Body() body: CreateGroupDto,
  ): Promise<GroupDetailDto> {
    const result = await this.createGroup.handle({ userId, name: body.name });
    return result.data;
  }

  @Post('join')
  @HttpCode(200)
  async join(
    @CurrentUser('id') userId: string,
    @Body() body: JoinGroupDto,
  ): Promise<GroupDetailDto> {
    const result = await this.joinGroup.handle({ userId, code: body.code });
    return result.data;
  }

  @Get()
  async list(@CurrentUser('id') userId: string): Promise<GroupSummaryDto[]> {
    const result = await this.listGroups.handle({ userId });
    return result.data;
  }

  @Get(':id')
  async detail(
    @CurrentUser('id') userId: string,
    @Param('id') groupId: string,
  ): Promise<GroupDetailDto> {
    const result = await this.groupDetail.handle({ userId, groupId });
    return result.data;
  }

  @Post(':id/regenerate-code')
  @HttpCode(200)
  async rotate(
    @CurrentUser('id') userId: string,
    @Param('id') groupId: string,
  ): Promise<{ inviteCode: string }> {
    const result = await this.regenerateCode.handle({ userId, groupId });
    return result.data;
  }

  @Post(':id/sessions')
  @HttpCode(201)
  async start(
    @CurrentUser('id') userId: string,
    @Param('id') groupId: string,
    @Body() body: StartSessionDto,
  ): Promise<StudySessionDto> {
    // The session runs on the owner's own document; the access service is
    // the same gate every reader endpoint uses.
    await this.access.requireReadable(body.documentId, userId);
    const result = await this.startSession.handle({
      userId,
      groupId,
      documentId: body.documentId,
      topicId: body.topicId ?? null,
      tutorId: body.tutorId,
    });
    return result.data;
  }

  @Post(':id/sessions/end')
  @HttpCode(204)
  async end(
    @CurrentUser('id') userId: string,
    @Param('id') groupId: string,
  ): Promise<void> {
    const live = await this.groups.liveSession(groupId);
    await this.endSession.handle({ userId, groupId });
    // Only after the handler authorized and flipped the row.
    if (live) this.gateway.endSession(live.id);
  }

  @Delete(':id/members/:memberId')
  @HttpCode(204)
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id') groupId: string,
    @Param('memberId') memberId: string,
  ): Promise<void> {
    await this.removeMember.handle({ userId, groupId, memberId });
  }
}
