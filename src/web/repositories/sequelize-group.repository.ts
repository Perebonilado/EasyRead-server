import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type {
  GroupRecord,
  GroupRepository,
  StudySessionRecord,
} from '../../business/repositories/group.repository';
import {
  StudyGroupMemberModel,
  StudyGroupModel,
  StudySessionModel,
} from '../database/models/study-group.model';
import { UserModel } from '../database/models/user.model';
import { newId } from '../database/uuid';

function toGroupRecord(group: StudyGroupModel): GroupRecord {
  return {
    id: group.id,
    ownerId: group.ownerId,
    name: group.name,
    inviteCode: group.inviteCode,
    members: (group.members ?? []).map((member) => ({
      userId: member.userId,
      name: member.user?.name ?? 'Someone',
      role: member.role,
    })),
  };
}

function toSessionRecord(session: StudySessionModel): StudySessionRecord {
  return {
    id: session.id,
    groupId: session.groupId,
    hostId: session.hostId,
    documentId: session.documentId,
    topicId: session.topicId,
    tutorId: session.tutorId,
    status: session.status,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
  };
}

const WITH_MEMBERS = {
  include: [{ model: StudyGroupMemberModel, include: [UserModel] }],
};

@Injectable()
export class SequelizeGroupRepository implements GroupRepository {
  constructor(
    @InjectModel(StudyGroupModel)
    private readonly groups: typeof StudyGroupModel,
    @InjectModel(StudyGroupMemberModel)
    private readonly members: typeof StudyGroupMemberModel,
    @InjectModel(StudySessionModel)
    private readonly sessions: typeof StudySessionModel,
  ) {}

  async create(input: {
    ownerId: string;
    name: string;
    inviteCode: string;
  }): Promise<GroupRecord> {
    const group = await this.groups.create({
      id: newId(),
      ownerId: input.ownerId,
      name: input.name,
      inviteCode: input.inviteCode,
    } as never);
    await this.members.create({
      id: newId(),
      groupId: group.id,
      userId: input.ownerId,
      role: 'owner',
    } as never);
    return (await this.findById(group.id))!;
  }

  async findById(groupId: string): Promise<GroupRecord | null> {
    const group = await this.groups.findOne({
      where: { id: groupId } as never,
      ...WITH_MEMBERS,
    } as never);
    return group ? toGroupRecord(group) : null;
  }

  async findByCode(inviteCode: string): Promise<GroupRecord | null> {
    const group = await this.groups.findOne({
      where: { inviteCode } as never,
      ...WITH_MEMBERS,
    } as never);
    return group ? toGroupRecord(group) : null;
  }

  async listForUser(userId: string): Promise<GroupRecord[]> {
    const memberships = await this.members.findAll({
      where: { userId } as never,
    });
    if (!memberships.length) return [];
    const groups = await this.groups.findAll({
      where: { id: memberships.map((m) => m.groupId) } as never,
      order: [['createdAt', 'DESC']],
      ...WITH_MEMBERS,
    } as never);
    return groups.map(toGroupRecord);
  }

  async addMember(groupId: string, userId: string): Promise<void> {
    await this.members.create({
      id: newId(),
      groupId,
      userId,
      role: 'member',
    } as never);
  }

  async removeMember(groupId: string, userId: string): Promise<void> {
    await this.members.destroy({ where: { groupId, userId } as never });
  }

  async setInviteCode(groupId: string, inviteCode: string): Promise<void> {
    await this.groups.update(
      { inviteCode },
      {
        where: { id: groupId } as never,
      },
    );
  }

  async createSession(input: {
    groupId: string;
    hostId: string;
    documentId: string;
    topicId: string | null;
    tutorId: string;
  }): Promise<StudySessionRecord> {
    const session = await this.sessions.create({
      id: newId(),
      ...input,
      status: 'live',
      startedAt: new Date(),
      endedAt: null,
    } as never);
    return toSessionRecord(session);
  }

  async liveSession(groupId: string): Promise<StudySessionRecord | null> {
    const session = await this.sessions.findOne({
      where: { groupId, status: 'live' } as never,
      order: [['startedAt', 'DESC']],
    } as never);
    return session ? toSessionRecord(session) : null;
  }

  async liveSessionsFor(groupIds: string[]): Promise<Map<string, string>> {
    if (!groupIds.length) return new Map();
    const sessions = await this.sessions.findAll({
      where: { groupId: groupIds, status: 'live' } as never,
    });
    return new Map(sessions.map((s) => [s.groupId, s.id]));
  }

  async findSession(sessionId: string): Promise<StudySessionRecord | null> {
    const session = await this.sessions.findOne({
      where: { id: sessionId } as never,
    });
    return session ? toSessionRecord(session) : null;
  }

  async endSession(sessionId: string): Promise<void> {
    await this.sessions.update(
      { status: 'ended', endedAt: new Date() },
      { where: { id: sessionId } as never },
    );
  }

  async liveSessionDocumentAccess(
    userId: string,
    documentId: string,
  ): Promise<boolean> {
    const sessions = await this.sessions.findAll({
      where: { documentId, status: 'live' } as never,
    });
    if (!sessions.length) return false;
    const membership = await this.members.findOne({
      where: {
        userId,
        groupId: sessions.map((s) => s.groupId),
      } as never,
    });
    return membership !== null;
  }
}
