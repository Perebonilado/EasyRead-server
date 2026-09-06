import { ConfigService } from '@nestjs/config';
import { INVITATION_LINES } from '../../domain/ask';
import { LectureInvitationHandler } from './lecture-invitation.handler';

describe('LectureInvitationHandler', () => {
  function harness() {
    const files = new Map<string, Buffer>();
    const spoken: string[] = [];
    const handler = new LectureInvitationHandler(
      {
        synthesize: (input: { text: string; voice?: string }) => {
          spoken.push(`${input.voice}:${input.text}`);
          return Promise.resolve({
            audio: Buffer.from(`audio of ${input.text}`),
            mimeType: 'audio/mpeg',
            model: 'fake-tts',
          });
        },
      },
      {
        size: (ref: string) => {
          const file = files.get(ref);
          if (!file) return Promise.reject(new Error('missing'));
          return Promise.resolve(file.length);
        },
        put: (input: { key: string; body: Buffer }) => {
          files.set(input.key, input.body);
          return Promise.resolve({
            ref: input.key,
            sizeBytes: input.body.length,
            mimeType: 'audio/mpeg',
          });
        },
      } as never,
      { require: () => Promise.resolve({ id: 'doc-1' }) } as never,
      new ConfigService({ AI_LECTURE_ASK_VOICE: 'cedar' }),
    );
    return { handler, files, spoken };
  }

  const request = { userId: 'user-1', documentId: 'doc-1' };

  it("records a line once, in the tutor's voice, and serves it from storage after", async () => {
    const { handler, files, spoken } = harness();
    const first = await handler.handle({ ...request, index: 2 });
    expect(first.data.text).toBe(INVITATION_LINES[2]);
    expect(first.data.fileRef).toContain('tutor/invitations/cedar/');
    expect(spoken).toEqual([`cedar:${INVITATION_LINES[2]}`]);
    expect(files.size).toBe(1);

    const again = await handler.handle({ ...request, index: 2 });
    expect(again.data.fileRef).toBe(first.data.fileRef);
    expect(spoken).toHaveLength(1);
  });

  it('refuses a line that does not exist', async () => {
    const { handler } = harness();
    await expect(
      handler.handle({ ...request, index: INVITATION_LINES.length }),
    ).rejects.toThrow('There is no such invitation');
  });
});
