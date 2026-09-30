import {
  CARTESIA_LIBRARY,
  ELEVENLABS_PREMADE,
} from '../../business/domain/scene-voice';
import {
  castAfter,
  modelsAfter,
  modelsKept,
  ratesAfter,
  ratesKept,
  voiceCast,
} from './sequelize-settings.repository';

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

describe('voice rates as kept', () => {
  it('lays a voice measured over those kept, voice by voice, and reads back only sound rates', () => {
    const kept = JSON.stringify({ kokoro: { am_puck: { wpm: 170 } } });
    const merged = ratesAfter(kept, {
      kokoro: { af_heart: { wpm: 160 } },
      gemini: { Sulafat: { wpm: 150, words: { natural: 152 } } },
    });
    expect(ratesKept(merged)).toEqual({
      kokoro: { am_puck: { wpm: 170 }, af_heart: { wpm: 160 } },
      gemini: { Sulafat: { wpm: 150, words: { natural: 152 } } },
    });
    expect(ratesKept('{"kokoro":{"x":{"wpm":-3}}}')).toEqual({});
    expect(ratesKept('nope')).toEqual({});
  });
});

describe('the admin’s models as kept', () => {
  it('reads back only a model the engine has, and gives an engine back its own on null', () => {
    expect(modelsKept(JSON.stringify({ elevenlabs: 'eleven_v3' }))).toEqual({
      elevenlabs: 'eleven_v3',
    });
    expect(modelsKept(JSON.stringify({ elevenlabs: 'eleven_v9' }))).toEqual({});
    expect(modelsKept('not json')).toEqual({});
    expect(modelsKept(null)).toEqual({});
    const kept = modelsAfter(null, { elevenlabs: 'eleven_v3' });
    expect(JSON.parse(kept!)).toEqual({ elevenlabs: 'eleven_v3' });
    expect(modelsAfter(kept, {})).toBe(kept);
    expect(modelsAfter(kept, { elevenlabs: null })).toBeNull();
  });
});
