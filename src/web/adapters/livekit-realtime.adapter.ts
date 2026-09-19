import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  RoomAgentDispatch,
  RoomConfiguration,
} from 'livekit-server-sdk';
import type {
  RealtimeAudioOptions,
  RealtimeSession,
  RealtimeTool,
} from '../../business/ports/voice.port';

/** How long a learner's token opens the door for; the call itself may run longer. */
const TOKEN_TTL = '15m';
/** The agent's name, as `speech/tutor/agent.py` registers it. */
export const TUTOR_AGENT = 'easiread-tutor';

/**
 * The brief the tutor agent reads from its dispatch: everything the model
 * needs before the learner says a word. Tools are forwarded to the
 * browser by name, so only their schemas travel here.
 */
export interface TutorBrief {
  instructions: string;
  tools: RealtimeTool[];
  voice: string;
  speed?: number;
  /** 'off' for the lecture's ask: the browser starts and ends every turn. */
  turnDetection?: 'off';
}

/**
 * A voice session on our own line: a LiveKit room on Railway, the learner
 * joining from the browser with a short-lived token, and the tutor agent
 * (`speech/tutor/`) dispatched into the same room with its brief. The
 * server never carries audio; it signs the door key and writes the brief
 * into the dispatch, and the room does the rest.
 *
 * `isConfigured()` gates every caller: without LIVEKIT_URL and the key
 * pair, a tutor marked for this line is voiced by OpenAI instead, as an
 * ElevenLabs tutor is without its key.
 */
@Injectable()
export class LiveKitRealtimeAdapter {
  private readonly logger = new Logger(LiveKitRealtimeAdapter.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('LIVEKIT_URL') &&
      this.config.get<string>('LIVEKIT_API_KEY') &&
      this.config.get<string>('LIVEKIT_API_SECRET'),
    );
  }

  async createSession({
    instructions,
    tools,
    voice,
    audio,
    identity,
    room,
  }: {
    instructions: string;
    tools?: RealtimeTool[];
    voice?: string;
    audio?: RealtimeAudioOptions;
    /** Who is joining, as the room will know them. */
    identity: string;
    /** The room's name; one per session. */
    room: string;
  }): Promise<RealtimeSession> {
    const brief: TutorBrief = {
      instructions,
      tools: tools ?? [],
      voice: voice ?? this.config.get<string>('LIVEKIT_TUTOR_VOICE', 'am_puck'),
      ...(audio?.speed ? { speed: audio.speed } : {}),
      ...(audio?.turnDetection === 'off'
        ? { turnDetection: 'off' as const }
        : {}),
    };
    const token = new AccessToken(
      this.config.getOrThrow<string>('LIVEKIT_API_KEY'),
      this.config.getOrThrow<string>('LIVEKIT_API_SECRET'),
      { identity, ttl: TOKEN_TTL },
    );
    token.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    // The agent is dispatched by the token itself: the room is created on
    // the learner's arrival and the tutor sent for in the same breath.
    token.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: TUTOR_AGENT,
          metadata: JSON.stringify(brief),
        }),
      ],
    });
    const jwt = await token.toJwt();
    this.logger.log(
      `room ${room}: ${brief.tools.length} tools, ${instructions.length} chars of brief`,
    );
    return {
      provider: 'livekit',
      url: this.config.getOrThrow<string>('LIVEKIT_URL'),
      token: jwt,
      room,
    };
  }
}
