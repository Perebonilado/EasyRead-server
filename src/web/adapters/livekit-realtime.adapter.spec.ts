import { ConfigService } from '@nestjs/config';
import {
  LiveKitRealtimeAdapter,
  TUTOR_AGENT,
} from './livekit-realtime.adapter';

/** A config from a plain object, the way the adapter reads .env. */
function config(values: Record<string, string>): ConfigService {
  return {
    get: (key: string, fallback?: string) => values[key] ?? fallback,
    getOrThrow: (key: string) => {
      if (values[key] === undefined) throw new Error(`${key} is not set`);
      return values[key];
    },
  } as unknown as ConfigService;
}

/** The claims inside a JWT, read without checking the signature. */
function claims(jwt: string): Record<string, unknown> {
  const [, payload] = jwt.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<
    string,
    unknown
  >;
}

describe('LiveKitRealtimeAdapter', () => {
  const live = config({
    LIVEKIT_URL: 'wss://room.test',
    LIVEKIT_API_KEY: 'APIkey',
    LIVEKIT_API_SECRET: 'a-secret-long-enough-to-sign-with-1234',
  });

  it('is configured only with the address and the key pair', () => {
    expect(new LiveKitRealtimeAdapter(live).isConfigured()).toBe(true);
    expect(
      new LiveKitRealtimeAdapter(
        config({ LIVEKIT_URL: 'wss://room.test' }),
      ).isConfigured(),
    ).toBe(false);
  });

  it('signs a door key for the room with the tutor dispatched and briefed', async () => {
    const session = await new LiveKitRealtimeAdapter(live).createSession({
      instructions: 'Teach the kidney.',
      tools: [
        { name: 'point', description: 'Point at a line', parameters: {} },
      ],
      voice: 'am_puck',
      identity: 'learner-1',
      room: 'tutor-doc-abc',
    });
    expect(session.provider).toBe('livekit');
    if (session.provider !== 'livekit') return;
    expect(session.url).toBe('wss://room.test');
    expect(session.room).toBe('tutor-doc-abc');
    const payload = claims(session.token);
    expect(payload.sub).toBe('learner-1');
    const video = payload.video as { room: string; roomJoin: boolean };
    expect(video.room).toBe('tutor-doc-abc');
    expect(video.roomJoin).toBe(true);
    const roomConfig = payload.roomConfig as {
      agents: { agentName: string; metadata: string }[];
    };
    expect(roomConfig.agents[0].agentName).toBe(TUTOR_AGENT);
    const brief = JSON.parse(roomConfig.agents[0].metadata) as {
      instructions: string;
      tools: { name: string }[];
      voice: string;
    };
    expect(brief.instructions).toBe('Teach the kidney.');
    expect(brief.tools.map((t) => t.name)).toEqual(['point']);
    expect(brief.voice).toBe('am_puck');
  });

  it('tells the agent when the browser holds the mic and how fast to speak', async () => {
    const session = await new LiveKitRealtimeAdapter(live).createSession({
      instructions: 'Answer the question.',
      voice: 'am_puck',
      audio: { turnDetection: 'off', speed: 0.9 },
      identity: 'learner-2',
      room: 'tutor-doc-def',
    });
    if (session.provider !== 'livekit') return;
    const roomConfig = claims(session.token).roomConfig as {
      agents: { metadata: string }[];
    };
    const brief = JSON.parse(roomConfig.agents[0].metadata) as {
      turnDetection?: string;
      speed?: number;
      tools: unknown[];
    };
    expect(brief.turnDetection).toBe('off');
    expect(brief.speed).toBe(0.9);
    expect(brief.tools).toEqual([]);
  });
});
