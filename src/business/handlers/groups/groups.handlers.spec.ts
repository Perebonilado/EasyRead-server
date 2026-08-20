/* eslint-disable @typescript-eslint/require-await -- an in-memory fake
   implements a Promise-shaped interface with no real awaiting to do. */
import {
  CreateGroupHandler,
  DeleteGroupHandler,
  ListGroupsHandler,
  UpdatePlanHandler,
  GroupDetailHandler,
  JoinGroupHandler,
  MAX_GROUP_MEMBERS,
  newInviteCode,
  RegenerateCodeHandler,
  RemoveMemberHandler,
} from './groups.handlers';
import type {
  GroupRecord,
  GroupRepository,
  StudySessionRecord,
} from '../../repositories/group.repository';

/** In-memory repository: the handlers' rules, none of Sequelize. */
class FakeGroups implements GroupRepository {
  groups = new Map<string, GroupRecord>();
  sessions = new Map<string, StudySessionRecord>();
  private seq = 0;

  async create(input: {
    ownerId: string;
    name: string;
    inviteCode: string;
  }): Promise<GroupRecord> {
    const id = `g${++this.seq}`;
    const group: GroupRecord = {
      id,
      ownerId: input.ownerId,
      name: input.name,
      inviteCode: input.inviteCode,
      members: [{ userId: input.ownerId, name: input.ownerId, role: 'owner' }],
      plan: { documentId: null, topicIds: [], tutorId: null },
    };
    this.groups.set(id, group);
    return structuredClone(group);
  }

  async findById(groupId: string) {
    const g = this.groups.get(groupId);
    return g ? structuredClone(g) : null;
  }

  async findByCode(code: string) {
    const g = [...this.groups.values()].find((x) => x.inviteCode === code);
    return g ? structuredClone(g) : null;
  }

  async listForUser(userId: string) {
    return [...this.groups.values()]
      .filter((g) => g.members.some((m) => m.userId === userId))
      .map((g) => structuredClone(g));
  }

  async addMember(groupId: string, userId: string) {
    this.groups.get(groupId)!.members.push({
      userId,
      name: userId,
      role: 'member',
    });
  }

  async deleteGroup(groupId: string) {
    this.groups.delete(groupId);
    for (const [id, session] of this.sessions) {
      if (session.groupId === groupId) this.sessions.delete(id);
    }
  }

  async removeMember(groupId: string, userId: string) {
    const g = this.groups.get(groupId)!;
    g.members = g.members.filter((m) => m.userId !== userId);
  }

  async setInviteCode(groupId: string, inviteCode: string) {
    this.groups.get(groupId)!.inviteCode = inviteCode;
  }

  async updatePlan(
    groupId: string,
    plan: {
      documentId: string | null;
      topicIds: string[];
      tutorId: string | null;
    },
  ) {
    this.groups.get(groupId)!.plan = plan;
  }

  async createSession(input: {
    groupId: string;
    hostId: string;
    documentId: string;
    topicIds: string[];
    tutorId: string;
  }): Promise<StudySessionRecord> {
    const session: StudySessionRecord = {
      id: `s${++this.seq}`,
      ...input,
      status: 'live',
      startedAt: new Date(),
      endedAt: null,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async liveSession(groupId: string) {
    return (
      [...this.sessions.values()].find(
        (s) => s.groupId === groupId && s.status === 'live',
      ) ?? null
    );
  }

  async liveSessionsFor(groupIds: string[]) {
    const map = new Map<string, StudySessionRecord>();
    for (const id of groupIds) {
      const live = await this.liveSession(id);
      if (live) map.set(id, live);
    }
    return map;
  }

  async findSession(sessionId: string) {
    return this.sessions.get(sessionId) ?? null;
  }

  async endSession(sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (s) {
      s.status = 'ended';
      s.endedAt = new Date();
    }
  }

  async liveSessionDocumentAccess(userId: string, documentId: string) {
    for (const s of this.sessions.values()) {
      if (s.status !== 'live' || s.documentId !== documentId) continue;
      const g = this.groups.get(s.groupId);
      if (g?.members.some((m) => m.userId === userId)) return true;
    }
    return false;
  }
}

describe('groups handlers', () => {
  let repo: FakeGroups;

  beforeEach(() => {
    repo = new FakeGroups();
  });

  it('creates a group with the creator as owner-member', async () => {
    const created = await new CreateGroupHandler(repo).handle({
      userId: 'ada',
      name: '  Econ crew ',
    });
    expect(created.data.name).toBe('Econ crew');
    expect(created.data.isOwner).toBe(true);
    expect(created.data.members).toHaveLength(1);
    expect(created.data.inviteCode).toHaveLength(8);
  });

  it('joins by code, case-insensitively, and twice is a no-op', async () => {
    const g = (
      await new CreateGroupHandler(repo).handle({ userId: 'ada', name: 'x' })
    ).data;
    const join = new JoinGroupHandler(repo);
    const first = await join.handle({
      userId: 'bola',
      code: g.inviteCode.toLowerCase(),
    });
    expect(first.data.members).toHaveLength(2);
    const second = await join.handle({ userId: 'bola', code: g.inviteCode });
    expect(second.data.members).toHaveLength(2);
  });

  it('refuses a seventh member with plain words', async () => {
    const g = (
      await new CreateGroupHandler(repo).handle({ userId: 'ada', name: 'x' })
    ).data;
    const join = new JoinGroupHandler(repo);
    for (let i = 1; i < MAX_GROUP_MEMBERS; i++) {
      await join.handle({ userId: `friend${i}`, code: g.inviteCode });
    }
    await expect(
      join.handle({ userId: 'one-too-many', code: g.inviteCode }),
    ).rejects.toThrow('full');
  });

  it('hides groups from non-members as not-found', async () => {
    const g = (
      await new CreateGroupHandler(repo).handle({ userId: 'ada', name: 'x' })
    ).data;
    await expect(
      new GroupDetailHandler(repo).handle({
        userId: 'stranger',
        groupId: g.id,
      }),
    ).rejects.toThrow('not found');
  });

  it('only the owner rotates the code', async () => {
    const g = (
      await new CreateGroupHandler(repo).handle({ userId: 'ada', name: 'x' })
    ).data;
    await new JoinGroupHandler(repo).handle({
      userId: 'bola',
      code: g.inviteCode,
    });
    await expect(
      new RegenerateCodeHandler(repo).handle({ userId: 'bola', groupId: g.id }),
    ).rejects.toThrow('owner');
    const rotated = await new RegenerateCodeHandler(repo).handle({
      userId: 'ada',
      groupId: g.id,
    });
    expect(rotated.data.inviteCode).not.toBe(g.inviteCode);
  });

  it('members remove themselves; only the owner removes others; the owner stays', async () => {
    const g = (
      await new CreateGroupHandler(repo).handle({ userId: 'ada', name: 'x' })
    ).data;
    const join = new JoinGroupHandler(repo);
    await join.handle({ userId: 'bola', code: g.inviteCode });
    await join.handle({ userId: 'chidi', code: g.inviteCode });
    const remove = new RemoveMemberHandler(repo);

    await expect(
      remove.handle({ userId: 'bola', groupId: g.id, memberId: 'chidi' }),
    ).rejects.toThrow('owner');
    await remove.handle({ userId: 'chidi', groupId: g.id, memberId: 'chidi' });
    await remove.handle({ userId: 'ada', groupId: g.id, memberId: 'bola' });
    await expect(
      remove.handle({ userId: 'ada', groupId: g.id, memberId: 'ada' }),
    ).rejects.toThrow('cannot leave');
    expect((await repo.findById(g.id))!.members).toHaveLength(1);
  });

  it('remembers the document picked at creation, preselecting nothing otherwise', async () => {
    const bare = await new CreateGroupHandler(repo).handle({
      userId: 'ada',
      name: 'no doc',
    });
    expect(bare.data.plan.documentId).toBeNull();

    const withDoc = await new CreateGroupHandler(repo).handle({
      userId: 'ada',
      name: 'econ',
      documentId: 'doc-1',
    });
    expect(withDoc.data.plan.documentId).toBe('doc-1');
  });

  it('persists plan edits, resets chapters on a document change, owner only', async () => {
    const g = (
      await new CreateGroupHandler(repo).handle({ userId: 'ada', name: 'x' })
    ).data;
    await new JoinGroupHandler(repo).handle({
      userId: 'bola',
      code: g.inviteCode,
    });
    const update = new UpdatePlanHandler(repo);

    const first = await update.handle({
      userId: 'ada',
      groupId: g.id,
      documentId: 'doc-1',
      topicIds: [],
      tutorId: 'maya',
    });
    expect(first.data.plan).toEqual({
      documentId: 'doc-1',
      topicIds: [],
      tutorId: 'maya',
    });

    const chapters = await update.handle({
      userId: 'ada',
      groupId: g.id,
      documentId: 'doc-1',
      topicIds: ['t1', 't2'],
      tutorId: 'maya',
    });
    expect(chapters.data.plan.topicIds).toEqual(['t1', 't2']);

    // Chapters belong to a document: switching documents drops them.
    const switched = await update.handle({
      userId: 'ada',
      groupId: g.id,
      documentId: 'doc-2',
      topicIds: ['t1', 't2'],
      tutorId: 'maya',
    });
    expect(switched.data.plan.topicIds).toEqual([]);

    await expect(
      update.handle({
        userId: 'bola',
        groupId: g.id,
        documentId: 'doc-3',
        topicIds: [],
        tutorId: null,
      }),
    ).rejects.toThrow('owner');
  });

  it('lets the owner delete the group, and nobody else', async () => {
    const g = (
      await new CreateGroupHandler(repo).handle({ userId: 'ada', name: 'x' })
    ).data;
    await new JoinGroupHandler(repo).handle({
      userId: 'bola',
      code: g.inviteCode,
    });
    const remove = new DeleteGroupHandler(repo);

    await expect(
      remove.handle({ userId: 'bola', groupId: g.id }),
    ).rejects.toThrow('owner');
    await expect(
      remove.handle({ userId: 'stranger', groupId: g.id }),
    ).rejects.toThrow('not found');

    await remove.handle({ userId: 'ada', groupId: g.id });
    expect(await repo.findById(g.id)).toBeNull();
    const mine = await new ListGroupsHandler(repo).handle({ userId: 'ada' });
    expect(mine.data).toHaveLength(0);
  });

  it("takes the group's sessions with it", async () => {
    const g = (
      await new CreateGroupHandler(repo).handle({ userId: 'ada', name: 'x' })
    ).data;
    await repo.createSession({
      groupId: g.id,
      hostId: 'ada',
      documentId: 'doc-1',
      topicIds: [],
      tutorId: 'maya',
    });
    await new DeleteGroupHandler(repo).handle({ userId: 'ada', groupId: g.id });
    expect(await repo.liveSession(g.id)).toBeNull();
  });

  it('invite codes avoid ambiguous characters', () => {
    for (let i = 0; i < 50; i++) {
      expect(newInviteCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    }
  });
});
