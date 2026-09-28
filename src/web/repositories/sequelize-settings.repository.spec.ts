import {
  CARTESIA_LIBRARY,
  ELEVENLABS_PREMADE,
} from '../../business/domain/scene-voice';
import { castAfter, voiceCast } from './sequelize-settings.repository';

describe('the admin’s voices as kept', () => {
  const eleven = { narrator: ELEVENLABS_PREMADE.Daniel };

  it('reads ElevenLabs’ voices saved before Cartesia was an engine, as they were', () => {
    expect(voiceCast(JSON.stringify({ elevenlabs: eleven }))).toEqual({
      elevenlabs: eleven,
    });
  });

  it('reads each engine’s own, and only an id that could be that engine’s', () => {
    expect(
      voiceCast(
        JSON.stringify({
          elevenlabs: { ...eleven, man: CARTESIA_LIBRARY.Leo },
          cartesia: {
            narrator: CARTESIA_LIBRARY.Lauren,
            girl: ELEVENLABS_PREMADE.Jessica,
            nobody: CARTESIA_LIBRARY.Leo,
          },
          other: { narrator: 'x' },
        }),
      ),
    ).toEqual({
      elevenlabs: eleven,
      cartesia: { narrator: CARTESIA_LIBRARY.Lauren },
    });
    expect(voiceCast('not json')).toEqual({});
    expect(voiceCast(null)).toEqual({});
  });

  it('lays a change to one engine over the others, keeping them, and nothing when none is left', () => {
    const kept = JSON.stringify({ elevenlabs: eleven });
    const both = castAfter(kept, {
      cartesia: { narrator: CARTESIA_LIBRARY.Lauren },
    });
    expect(JSON.parse(both!)).toEqual({
      elevenlabs: eleven,
      cartesia: { narrator: CARTESIA_LIBRARY.Lauren },
    });
    expect(JSON.parse(castAfter(both, { cartesia: {} })!)).toEqual({
      elevenlabs: eleven,
    });
    expect(castAfter(kept, { elevenlabs: {} })).toBeNull();
  });
});
