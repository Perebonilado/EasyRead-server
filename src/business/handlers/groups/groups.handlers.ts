import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../domain/errors/errors';
import { GROUP_REPOSITORY } from '../../repositories/tokens';
import type {
  GroupRecord,
  GroupRepository,
} from '../../repositories/group.repository';
import type {
  GroupDetailDto,
  GroupSummaryDto,
  StudySessionDto,
} from '../../../contracts';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { TUTORS } from '../../domain/values/tutors';

/** Friends studying, not a webinar — the tutor protocol degrades past six. */
export const MAX_GROUP_MEMBERS = 6;

/**
 * Invite codes are Crockford base32: no vowels-and-lookalikes ambiguity when
 * a friend reads one out across a room.
 */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function newInviteCode(): string {
  const bytes = randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[bytes[i] % 32];
  return code;
}

const toSummary = (
  group: GroupRecord,
  userId: string,
  liveSessionId: string | null,
): GroupSummaryDto => ({
  id: group.id,
  name: group.name,
  ownerId: group.ownerId,
  isOwner: group.ownerId === userId,
  memberNames: group.members.map((m) => m.name),
  liveSessionId,
});

export const toSessionDto = (session: {
  id: string;
  groupId: string;
  hostId: string;
  documentId: string;
  topicId: string | null;
  tutorId: string;
  status: 'live' | 'ended';
  startedAt: Date;
}): StudySessionDto => ({
  id: session.id,
  groupId: session.groupId,
  hostId: session.hostId,
  documentId: session.documentId,
  topicId: session.topicId,
  tutorId: session.tutorId,
  status: session.status,
  startedAt: session.startedAt.toISOString(),
});

const toDetail = (
  group: GroupRecord,
  userId: string,
  live: StudySessionDto | null,
): GroupDetailDto => ({
  id: group.id,
  name: group.name,
  ownerId: group.ownerId,
  isOwner: group.ownerId === userId,
  inviteCode: group.inviteCode,
  members: group.members,
  liveSession: live,
});

function requireMembership(group: GroupRecord, userId: string) {
  if (!group.members.some((m) => m.userId === userId)) {
    // Outsiders get the same answer as for a group that never existed.
    throw new NotFoundError('Group');
  }
}

// ── Create ──────────────────────────────────────────────────────────────────

export interface CreateGroupRequest {
  userId: string;
  name: string;
}

@Injectable()
export class CreateGroupHandler extends AbstractRequestHandlerTemplate<
  CreateGroupRequest,
  GroupDetailDto
> {
  constructor(
    @Inject(GROUP_REPOSITORY) private readonly groups: GroupRepository,
  ) {
    super();
  }

  protected async handleRequest(cmd: CreateGroupRequest) {
    const name = cmd.name.trim();
    if (!name) throw new ValidationError('A group needs a name');
    const group = await this.groups.create({
      ownerId: cmd.userId,
      name,
      inviteCode: newInviteCode(),
    });
    return CommandResponse.of(toDetail(group, cmd.userId, null));
  }
}

// ── Join by code ─────────────────────────────────────────────────────────────

export interface JoinGroupRequest {
  userId: string;
  code: string;
}

@Injectable()
export class JoinGroupHandler extends AbstractRequestHandlerTemplate<
  JoinGroupRequest,
  GroupDetailDto
> {
  constructor(
    @Inject(GROUP_REPOSITORY) private readonly groups: GroupRepository,
  ) {
    super();
  }

  protected async handleRequest(cmd: JoinGroupRequest) {
    const code = cmd.code.trim().toUpperCase();
    const group = await this.groups.findByCode(code);
    if (!group) throw new NotFoundError('Group');

    // Joining twice is not an error — the link was tapped twice.
    if (!group.members.some((m) => m.userId === cmd.userId)) {
      if (group.members.length >= MAX_GROUP_MEMBERS) {
        throw new ValidationError(
          'This group is full. Groups hold up to six people',
        );
      }
      await this.groups.addMember(group.id, cmd.userId);
    }

    const fresh = (await this.groups.findById(group.id))!;
    const live = await this.groups.liveSession(group.id);
    return CommandResponse.of(
      toDetail(fresh, cmd.userId, live ? toSessionDto(live) : null),
    );
  }
}

// ── List mine ────────────────────────────────────────────────────────────────

export interface ListGroupsRequest {
  userId: string;
}

@Injectable()
export class ListGroupsHandler extends AbstractRequestHandlerTemplate<
  ListGroupsRequest,
  GroupSummaryDto[]
> {
  constructor(
    @Inject(GROUP_REPOSITORY) private readonly groups: GroupRepository,
  ) {
    super();
  }

  protected async handleRequest(cmd: ListGroupsRequest) {
    const groups = await this.groups.listForUser(cmd.userId);
    const live = await this.groups.liveSessionsFor(groups.map((g) => g.id));
    return CommandResponse.of(
      groups.map((g) => toSummary(g, cmd.userId, live.get(g.id) ?? null)),
    );
  }
}

// ── Detail ───────────────────────────────────────────────────────────────────

export interface GroupDetailRequest {
  userId: string;
  groupId: string;
}

@Injectable()
export class GroupDetailHandler extends AbstractRequestHandlerTemplate<
  GroupDetailRequest,
  GroupDetailDto
> {
  constructor(
    @Inject(GROUP_REPOSITORY) private readonly groups: GroupRepository,
  ) {
    super();
  }

  protected async handleRequest(cmd: GroupDetailRequest) {
    const group = await this.groups.findById(cmd.groupId);
    if (!group) throw new NotFoundError('Group');
    requireMembership(group, cmd.userId);
    const live = await this.groups.liveSession(group.id);
    return CommandResponse.of(
      toDetail(group, cmd.userId, live ? toSessionDto(live) : null),
    );
  }
}

// ── Rotate the invite code ───────────────────────────────────────────────────

export interface RegenerateCodeRequest {
  userId: string;
  groupId: string;
}

@Injectable()
export class RegenerateCodeHandler extends AbstractRequestHandlerTemplate<
  RegenerateCodeRequest,
  { inviteCode: string }
> {
  constructor(
    @Inject(GROUP_REPOSITORY) private readonly groups: GroupRepository,
  ) {
    super();
  }

  protected async handleRequest(cmd: RegenerateCodeRequest) {
    const group = await this.groups.findById(cmd.groupId);
    if (!group) throw new NotFoundError('Group');
    requireMembership(group, cmd.userId);
    if (group.ownerId !== cmd.userId) {
      throw new ForbiddenError('Only the group owner can change the code');
    }
    const inviteCode = newInviteCode();
    await this.groups.setInviteCode(group.id, inviteCode);
    return CommandResponse.of({ inviteCode });
  }
}

// ── Remove a member (owner removes anyone; anyone removes themself) ─────────

export interface RemoveMemberRequest {
  userId: string;
  groupId: string;
  memberId: string;
}

@Injectable()
export class RemoveMemberHandler extends AbstractRequestHandlerTemplate<
  RemoveMemberRequest,
  void
> {
  constructor(
    @Inject(GROUP_REPOSITORY) private readonly groups: GroupRepository,
  ) {
    super();
  }

  protected async handleRequest(cmd: RemoveMemberRequest) {
    const group = await this.groups.findById(cmd.groupId);
    if (!group) throw new NotFoundError('Group');
    requireMembership(group, cmd.userId);

    const removingSelf = cmd.memberId === cmd.userId;
    if (!removingSelf && group.ownerId !== cmd.userId) {
      throw new ForbiddenError('Only the group owner can remove someone');
    }
    if (cmd.memberId === group.ownerId) {
      // The owner leaving would orphan the group; V1 keeps them in it.
      throw new ValidationError('The group owner cannot leave their own group');
    }
    await this.groups.removeMember(group.id, cmd.memberId);
    return CommandResponse.empty();
  }
}

// ── Sessions: the owner starts one; anyone in the group joins mid-flight ────

export interface StartSessionRequest {
  userId: string;
  groupId: string;
  documentId: string;
  topicId: string | null;
  tutorId: string;
}

@Injectable()
export class StartSessionHandler extends AbstractRequestHandlerTemplate<
  StartSessionRequest,
  StudySessionDto
> {
  constructor(
    @Inject(GROUP_REPOSITORY) private readonly groups: GroupRepository,
  ) {
    super();
  }

  protected async handleRequest(cmd: StartSessionRequest) {
    const group = await this.groups.findById(cmd.groupId);
    if (!group) throw new NotFoundError('Group');
    requireMembership(group, cmd.userId);
    if (group.ownerId !== cmd.userId) {
      throw new ForbiddenError('Only the group owner starts a session');
    }
    if (!TUTORS.some((tutor) => tutor.id === cmd.tutorId)) {
      throw new ValidationError('Pick a tutor from the list');
    }

    // One live session per group: starting again just returns the live one,
    // so a double-tap or a stale page never forks the room.
    const existing = await this.groups.liveSession(group.id);
    if (existing) return CommandResponse.of(toSessionDto(existing));

    const session = await this.groups.createSession({
      groupId: group.id,
      hostId: cmd.userId,
      documentId: cmd.documentId,
      topicId: cmd.topicId,
      tutorId: cmd.tutorId,
    });
    return CommandResponse.of(toSessionDto(session));
  }
}

export interface EndSessionRequest {
  userId: string;
  groupId: string;
}

@Injectable()
export class EndSessionHandler extends AbstractRequestHandlerTemplate<
  EndSessionRequest,
  void
> {
  constructor(
    @Inject(GROUP_REPOSITORY) private readonly groups: GroupRepository,
  ) {
    super();
  }

  protected async handleRequest(cmd: EndSessionRequest) {
    const group = await this.groups.findById(cmd.groupId);
    if (!group) throw new NotFoundError('Group');
    requireMembership(group, cmd.userId);
    if (group.ownerId !== cmd.userId) {
      throw new ForbiddenError('Only the group owner ends the session');
    }
    const live = await this.groups.liveSession(group.id);
    if (live) await this.groups.endSession(live.id);
    return CommandResponse.empty();
  }
}
