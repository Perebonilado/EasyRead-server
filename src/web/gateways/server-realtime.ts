import { Logger } from '@nestjs/common';
import WebSocket from 'ws';

/**
 * A server-owned OpenAI Realtime session (classroom plan P2 §7.1).
 *
 * The solo tutor hands the browser ephemeral credentials and never touches
 * audio; a classroom cannot work that way — one tutor must be heard by six
 * people and told who is speaking. So the server holds the one websocket,
 * forwards the floor-holder's audio up, and fans the tutor's audio out.
 *
 * Turn detection is off: push-to-talk gives exact turn boundaries, so the
 * server commits the buffer and asks for a response itself. Event names are
 * read tolerantly (GA and beta spell the audio deltas differently).
 */
export interface RealtimeCallbacks {
  onAudio: (base64Pcm16: string) => void;
  onCaption: (delta: string, done: boolean) => void;
  onToolCall: (call: { callId: string; name: string; args: string }) => void;
  onSpeaking: (speaking: boolean) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

export interface RealtimeToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export class ServerRealtime {
  private readonly logger = new Logger(ServerRealtime.name);
  private socket: WebSocket | null = null;
  private closed = false;

  constructor(
    private readonly opts: {
      apiKey: string;
      model: string;
      voice: string;
      instructions: string;
      tools: RealtimeToolSpec[];
      callbacks: RealtimeCallbacks;
    },
  ) {}

  connect(): Promise<void> {
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.opts.model)}`;
    const socket = new WebSocket(url, {
      headers: { Authorization: `Bearer ${this.opts.apiKey}` },
    });
    this.socket = socket;

    return new Promise((resolve, reject) => {
      const failed = (err: Error) => {
        this.logger.error(`Realtime connect failed: ${err.message}`);
        reject(err);
      };
      socket.once('error', failed);
      socket.once('open', () => {
        socket.off('error', failed);
        this.configure();
        resolve();
      });
      socket.on('message', (data: Buffer | string) =>
        this.onMessage(typeof data === 'string' ? data : data.toString('utf8')),
      );
      socket.on('close', () => {
        if (!this.closed) this.opts.callbacks.onClose();
      });
      socket.on('error', (err) =>
        this.opts.callbacks.onError(err.message ?? 'realtime error'),
      );
    });
  }

  private configure() {
    // The GA session shape: audio config nested, turn detection off because
    // push-to-talk gives exact turn boundaries.
    this.send({
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions: this.opts.instructions,
        output_modalities: ['audio'],
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            turn_detection: null,
          },
          output: {
            format: { type: 'audio/pcm', rate: 24000 },
            voice: this.opts.voice,
          },
        },
        tools: this.opts.tools.map((tool) => ({
          type: 'function',
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
        tool_choice: 'auto',
      },
    });
  }

  /** A parenthetical the tutor reads silently: attribution, joins, results. */
  inject(text: string, respond = false) {
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    });
    if (respond) this.respond();
  }

  appendAudio(base64Pcm16: string) {
    this.send({ type: 'input_audio_buffer.append', audio: base64Pcm16 });
  }

  /** Push-to-talk release: the turn is exactly what was held down. */
  commitTurn() {
    this.send({ type: 'input_audio_buffer.commit' });
  }

  /** A hold that produced no real audio: drop it rather than commit it. */
  clearInput() {
    this.send({ type: 'input_audio_buffer.clear' });
  }

  /** A student interrupted: stop the response mid-sentence. */
  cancelResponse() {
    this.send({ type: 'response.cancel' });
  }

  toolResult(callId: string, output: string, respond = true) {
    this.send({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: callId, output },
    });
    if (respond) this.respond();
  }

  respond() {
    this.send({ type: 'response.create' });
  }

  close() {
    this.closed = true;
    this.socket?.close();
    this.socket = null;
  }

  private send(event: Record<string, unknown>) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(event));
    } else {
      this.logger.warn(`send dropped (socket not open): ${String(event.type)}`);
    }
  }

  private onMessage(raw: string) {
    let event: {
      type?: string;
      delta?: string;
      error?: { message?: string };
      response?: {
        output?: {
          type?: string;
          call_id?: string;
          name?: string;
          arguments?: string;
        }[];
      };
    };
    try {
      event = JSON.parse(raw) as typeof event;
    } catch {
      return;
    }
    const type = event.type ?? '';

    if (type === 'response.created') {
      // Speaking state comes from the API, never from optimism: a refused
      // response.create must not wedge the room into "tutor is speaking".
      this.opts.callbacks.onSpeaking(true);
      return;
    }
    if (
      type === 'response.audio.delta' ||
      type === 'response.output_audio.delta'
    ) {
      if (event.delta) this.opts.callbacks.onAudio(event.delta);
      return;
    }
    if (
      type === 'response.audio_transcript.delta' ||
      type === 'response.output_audio_transcript.delta'
    ) {
      if (event.delta) this.opts.callbacks.onCaption(event.delta, false);
      return;
    }
    if (
      type === 'response.audio_transcript.done' ||
      type === 'response.output_audio_transcript.done'
    ) {
      this.opts.callbacks.onCaption('', true);
      return;
    }
    if (type === 'response.done') {
      // Tool calls ride the finished response — the one place both API
      // generations agree on.
      for (const item of event.response?.output ?? []) {
        if (item.type === 'function_call' && item.call_id && item.name) {
          this.opts.callbacks.onToolCall({
            callId: item.call_id,
            name: item.name,
            args: item.arguments ?? '{}',
          });
        }
      }
      this.opts.callbacks.onSpeaking(false);
      return;
    }
    if (type === 'error') {
      this.logger.warn(`Realtime error event: ${event.error?.message}`);
      this.opts.callbacks.onError(event.error?.message ?? 'realtime error');
    }
  }
}
