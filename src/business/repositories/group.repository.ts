/**
 * Study groups (classroom plan P0).
 *
 * The repository speaks in plain records so handlers stay testable with an
 * in-memory fake. Member lists carry names because every surface that shows
 * a group shows its people.
 */
export interface GroupMemberRecord {
  userId: string;
  name: string;
  role: 'owner' | 'member';
}

export interface GroupPlanRecord {
  /** Null until the owner picks one; nothing is preselected. */
  documentId: string | null;
  topicIds: string[];
  tutorId: string | null;
}

export interface GroupRecord {
  id: string;
  ownerId: string;
  name: string;
  inviteCode: string;
  members: GroupMemberRecord[];
  /** What the next session will study; it persists between visits. */
  plan: GroupPlanRecord;
}

export interface StudySessionRecord {
  id: string;
  groupId: string;
  hostId: string;
  documentId: string;
  /** Chapter scope; empty means the whole document. */
  topicIds: string[];
  tutorId: string;
  status: 'live' | 'ended';
  startedAt: Date;
  endedAt: Date | null;
}

export interface GroupRepository {
  create(input: {
    ownerId: string;
    name: string;
    inviteCode: string;
  }): Promise<GroupRecord>;

  findById(groupId: string): Promise<GroupRecord | null>;
  findByCode(inviteCode: string): Promise<GroupRecord | null>;
  listForUser(userId: string): Promise<GroupRecord[]>;

  addMember(groupId: string, userId: string): Promise<void>;
  /** Removes the group; members and sessions cascade with it. */
  deleteGroup(groupId: string): Promise<void>;
  updatePlan(groupId: string, plan: GroupPlanRecord): Promise<void>;
  removeMember(groupId: string, userId: string): Promise<void>;
  setInviteCode(groupId: string, inviteCode: string): Promise<void>;

  createSession(input: {
    groupId: string;
    hostId: string;
    documentId: string;
    topicIds: string[];
    tutorId: string;
  }): Promise<StudySessionRecord>;
  liveSession(groupId: string): Promise<StudySessionRecord | null>;
  /** Live session ids across many groups at once, for the list page. */
  liveSessionsFor(groupIds: string[]): Promise<Map<string, StudySessionRecord>>;
  findSession(sessionId: string): Promise<StudySessionRecord | null>;
  endSession(sessionId: string): Promise<void>;
  /** Is the user a member of any live session on this document? */
  liveSessionDocumentAccess(
    userId: string,
    documentId: string,
  ): Promise<boolean>;
}
