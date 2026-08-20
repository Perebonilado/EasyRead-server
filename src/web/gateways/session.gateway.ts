import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { InjectModel } from '@nestjs/sequelize';
import { JwtService } from '../../auth/jwt.service';
import { UserModel } from '../database/models';
import { GROUP_REPOSITORY } from '../../business/repositories/tokens';
import type { GroupRepository } from '../../business/repositories/group.repository';
import { GroupLesson, GroupLessonFactory } from './group-lesson';

/** What auth middleware stamps onto every admitted socket. */
interface SocketAuth {
  userId?: string;
  name?: string;
}

const authOf = (socket: Socket): SocketAuth => socket.data as SocketAuth;

/** One member as the roster shows them. */
interface RosterEntry {
  userId: string;
  name: string;
  connected: boolean;
}

interface Room {
  sessionId: string;
  groupId: string;
  roster: Map<string, { name: string; sockets: Set<string> }>;
  /** Armed while nobody is connected; an empty room ends its session. */
  idleTimer: ReturnType<typeof setTimeout> | null;
  /** The tutor (P2): opened on the first join, closed with the room. */
  lesson: GroupLesson | null;
  lessonStarting: boolean;
  board: { id: string; kind: string; title: string; body: string }[];
}

/**
 * The live session room (classroom plan P1).
 *
 * Presence and stage sync for a study session: members join the socket room
 * for a live session, everyone sees who is here, and the host's end takes
 * the room down. The tutor (P2) will drive stage events through the same
 * room. State is in-memory on this instance — the realtime connection (P2)
 * pins a session to one instance anyway, and Redis adapters come when scale
 * asks for them.
 */
/** An abandoned room ends its session after this long with nobody in it. */
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

@WebSocketGateway({
  namespace: '/sessions',
  cors: { origin: true, credentials: true },
})
export class SessionGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly logger = new Logger(SessionGateway.name);
  private readonly rooms = new Map<string, Room>();
  /** socketId → the session it joined, for disconnect bookkeeping. */
  private readonly socketSessions = new Map<string, string>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    @InjectModel(UserModel) private readonly users: typeof UserModel,
    @Inject(GROUP_REPOSITORY) private readonly groups: GroupRepository,
    private readonly lessons: GroupLessonFactory,
  ) {}

  /**
   * Auth is namespace middleware, not a connection handler: middleware
   * finishes before the socket is admitted, so the first message a client
   * sends can never race an unfinished token check. A bad token surfaces to
   * the client as connect_error.
   */
  afterInit(server: Server) {
    server.use((socket, next) => {
      void (async () => {
        try {
          const token = (socket.handshake.auth as { token?: string })?.token;
          if (!token) throw new Error('no token');
          const claims = this.jwt.verifyAccessToken(token);
          const user = await this.users.findByPk(claims.sub);
          if (!user || user.deletedAt || user.tokenVersion !== claims.ver) {
            throw new Error('stale token');
          }
          const data = authOf(socket);
          data.userId = user.id;
          data.name = user.name;
          next();
        } catch {
          next(new Error('Sign in again to join'));
        }
      })();
    });
  }

  handleDisconnect(socket: Socket) {
    const sessionId = this.socketSessions.get(socket.id);
    if (!sessionId) return;
    this.socketSessions.delete(socket.id);
    const room = this.rooms.get(sessionId);
    const userId = authOf(socket).userId;
    if (!room || !userId) return;

    const entry = room.roster.get(userId);
    if (!entry) return;
    entry.sockets.delete(socket.id);
    if (entry.sockets.size === 0) {
      this.broadcastRoster(room);
      // A vanished floor-holder must not wedge the room.
      if (room.lesson?.holder()?.userId === userId) {
        room.lesson.releaseFloor(userId);
        this.broadcastFloor(room);
      }
      room.lesson?.rosterChanged(`${entry.name} left the session`);
    }

    // Nobody left at all: arm the idle timer. A session the group walked
    // away from should not stay live all night.
    const anyoneConnected = [...room.roster.values()].some(
      (member) => member.sockets.size > 0,
    );
    if (!anyoneConnected && !room.idleTimer) {
      room.idleTimer = setTimeout(() => {
        void this.groups
          .endSession(room.sessionId)
          .then(() => this.endSession(room.sessionId))
          .catch(() => {});
      }, IDLE_TIMEOUT_MS);
    }
  }

  @SubscribeMessage('session:join')
  async onJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { sessionId: string },
  ) {
    const userId = authOf(socket).userId ?? '';
    const session = await this.groups.findSession(body?.sessionId ?? '');
    if (!session || session.status !== 'live') {
      socket.emit('session:ended', { reason: 'not-live' });
      return;
    }
    const group = await this.groups.findById(session.groupId);
    if (!group || !group.members.some((m) => m.userId === userId)) {
      socket.emit('session:error', { message: 'This session is not yours' });
      return;
    }

    let room = this.rooms.get(session.id);
    if (!room) {
      room = {
        sessionId: session.id,
        groupId: session.groupId,
        roster: new Map(),
        idleTimer: null,
        lesson: null,
        lessonStarting: false,
        board: [],
      };
      this.rooms.set(session.id, room);
    }
    if (room.idleTimer) {
      clearTimeout(room.idleTimer);
      room.idleTimer = null;
    }
    const name = authOf(socket).name ?? 'Someone';
    const entry = room.roster.get(userId) ?? { name, sockets: new Set() };
    entry.sockets.add(socket.id);
    room.roster.set(userId, entry);

    await socket.join(this.channel(session.id));
    this.socketSessions.set(socket.id, session.id);

    // A joiner mid-lecture lands in the lecture, not in silence: the state
    // carries the tutor's presence, and the unplayed audio tail follows.
    const catchUp = room.lesson?.catchUp() ?? null;
    socket.emit('session:state', {
      session: {
        id: session.id,
        groupId: session.groupId,
        hostId: session.hostId,
        documentId: session.documentId,
        topicIds: session.topicIds,
        tutorId: session.tutorId,
      },
      roster: this.rosterOf(room),
      board: room.board,
      floor: room.lesson?.holder() ?? null,
      tutorReady: !!room.lesson,
      tutorSpeaking: catchUp?.speaking ?? false,
      caption: catchUp?.caption ?? '',
    });
    if (catchUp?.audio) socket.emit('tutor:audio', { chunk: catchUp.audio });
    this.broadcastRoster(room);

    // The tutor: opened by the first arrival, told about later ones.
    if (!room.lesson && !room.lessonStarting) {
      room.lessonStarting = true;
      void this.startLesson(room, session).catch((error: Error) => {
        room.lessonStarting = false;
        this.logger.error(`Lesson start failed: ${error.message}`);
        this.server.to(this.channel(session.id)).emit('tutor:error', {
          message: 'The tutor could not join. The room still works.',
        });
      });
    } else if (room.lesson && entry.sockets.size === 1) {
      room.lesson.rosterChanged(
        `${name} joined the session. Greet them briefly and continue`,
      );
    }
  }

  private async startLesson(
    room: Room,
    session: NonNullable<Awaited<ReturnType<GroupRepository['findSession']>>>,
  ) {
    const channel = this.channel(session.id);
    const lesson = await this.lessons.create(
      session,
      session.hostId,
      () =>
        [...room.roster.entries()]
          .filter(([, entry]) => entry.sockets.size > 0)
          .map(([userId, entry]) => ({ userId, name: entry.name })),
      {
        onAudio: (chunk) =>
          this.server.to(channel).emit('tutor:audio', { chunk }),
        onCaption: (delta, done) =>
          this.server.to(channel).emit('tutor:caption', { delta, done }),
        onSpeaking: (speaking) => {
          this.server.to(channel).emit('tutor:speaking', { speaking });
          if (!speaking) this.broadcastFloor(room);
        },
        onBoard: (item) => {
          room.board.push(item);
          this.server.to(channel).emit('stage:board', { item });
        },
        onCheckOpen: (check) =>
          this.server.to(channel).emit('check:open', { check }),
        onCheckResult: (result) =>
          this.server.to(channel).emit('check:result', { result }),
        onEnded: () => {
          void this.groups.endSession(session.id).catch(() => {});
          this.endSession(session.id);
        },
        onError: (message) =>
          this.server.to(channel).emit('tutor:error', { message }),
      },
    );
    await lesson.start();
    room.lesson = lesson;
    room.lessonStarting = false;
  }

  // ── The floor (P2): held by one person, visible to everyone ───────────────

  @SubscribeMessage('floor:request')
  onFloorRequest(@ConnectedSocket() socket: Socket) {
    const room = this.roomOf(socket);
    const userId = authOf(socket).userId;
    const name = authOf(socket).name ?? 'Someone';
    if (!room?.lesson || !userId) return;
    const granted = room.lesson.requestFloor(userId, name);
    if (granted) this.broadcastFloor(room);
    else socket.emit('floor:denied', { holder: room.lesson.holder() });
  }

  @SubscribeMessage('floor:release')
  onFloorRelease(@ConnectedSocket() socket: Socket) {
    const room = this.roomOf(socket);
    const userId = authOf(socket).userId;
    if (!room?.lesson || !userId) return;
    room.lesson.releaseFloor(userId);
    this.broadcastFloor(room);
  }

  @SubscribeMessage('audio:chunk')
  onAudioChunk(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { chunk: string },
  ) {
    const room = this.roomOf(socket);
    const userId = authOf(socket).userId;
    if (!room?.lesson || !userId || typeof body?.chunk !== 'string') return;
    if (room.lesson.holder()?.userId !== userId) return;
    room.lesson.appendAudio(userId, body.chunk);
    // The classroom hears its own people: the floor-holder's voice fans out
    // to everyone else in the room, not only to the tutor.
    socket
      .to(this.channel(room.sessionId))
      .emit('peer:audio', { userId, chunk: body.chunk });
  }

  @SubscribeMessage('check:answer')
  onCheckAnswer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { checkId: string; index: number },
  ) {
    const room = this.roomOf(socket);
    const userId = authOf(socket).userId;
    if (!room?.lesson || !userId) return;
    room.lesson.answerCheck(userId, String(body?.checkId), Number(body?.index));
  }

  private roomOf(socket: Socket): Room | undefined {
    const sessionId = this.socketSessions.get(socket.id);
    return sessionId ? this.rooms.get(sessionId) : undefined;
  }

  private broadcastFloor(room: Room) {
    this.server
      .to(this.channel(room.sessionId))
      .emit('floor:state', { holder: room.lesson?.holder() ?? null });
  }

  @SubscribeMessage('session:leave')
  async onLeave(@ConnectedSocket() socket: Socket) {
    const sessionId = this.socketSessions.get(socket.id);
    if (!sessionId) return;
    await socket.leave(this.channel(sessionId));
    this.handleDisconnect(socket);
  }

  /** Called by the controller when the owner ends the session over REST. */
  endSession(sessionId: string) {
    const room = this.rooms.get(sessionId);
    if (room?.idleTimer) clearTimeout(room.idleTimer);
    room?.lesson?.close();
    this.server
      .to(this.channel(sessionId))
      .emit('session:ended', { reason: 'host-ended' });
    if (room) this.rooms.delete(sessionId);
  }

  private channel(sessionId: string) {
    return `session:${sessionId}`;
  }

  private rosterOf(room: Room): RosterEntry[] {
    return [...room.roster.entries()].map(([userId, entry]) => ({
      userId,
      name: entry.name,
      connected: entry.sockets.size > 0,
    }));
  }

  private broadcastRoster(room: Room) {
    this.server
      .to(this.channel(room.sessionId))
      .emit('roster:update', { roster: this.rosterOf(room) });
  }
}
