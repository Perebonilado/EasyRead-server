/**
 * Faces of moving parts (scene-face-rig, studio-story-plan §3B): the
 * channels, the recipes and their mixes, what is said over what is felt,
 * the timing (a face eased on, a take, blinks, darts, glances), the
 * geometry at rest as the kit's neutral face, and the drawings, the
 * acting and the stills that carry it.
 */
import type { SceneStepDto } from '../../contracts';
import { actingOf, type SpokenLine } from './scene-acting';
import {
  BLINK_MS,
  CHANNEL_RANGE,
  FACE_CHANNELS,
  FACE_OF_RECIPE,
  NEUTRAL_FACE,
  RECIPES,
  RECIPE_NAMES,
  RECIPE_OF_FACE,
  blendFaces,
  blinkAt,
  faceAt,
  faceMarkup,
  faceParts,
  faceRigPrint,
  geoAttr,
  geoOfAttr,
  mixRecipes,
  recipeFace,
  recipeNamed,
  saidAndFelt,
  trackAt,
  withViseme,
  type FaceGeo,
  type FaceKey,
} from './scene-face-rig';
import { faceInScene, withRigFace } from './scene-face-draw';
import { FACES, drawFigure, rigOf, type FigureSpec } from './scene-figure';
import { EXPRESSIONS } from './scene-story';
import {
  lineFace,
  reactionFace,
  temperOf,
  type LineAim,
} from './scene-performance';
import { FIGURE_INK } from './scene-ink';

const R = rigOf('adult');
const FRONT: FaceGeo = {
  eyes: [
    { x: -R.eyes.dx, y: R.eyes.y, rx: 15, ry: 16.5, side: -1, w: 1, fwd: 0 },
    { x: R.eyes.dx, y: R.eyes.y, rx: 15, ry: 16.5, side: 1, w: 1, fwd: 0 },
  ],
  my: R.mouthY,
  mouth: { x: 0, w: 1, half: false },
};

const SPEC: FigureSpec = {
  age: 'adult',
  build: 'average',
  skin: 6,
  hair: 'short',
  hairColour: 'black',
  facialHair: 'none',
  headwear: 'none',
  top: 't-shirt',
  topColour: 'blue',
  bottom: 'trousers',
  bottomColour: 'navy',
  accentColour: 'red',
  extras: [],
};

/** The same file in the player: its print must be this too (face-rig.test.ts). */
const PRINT = '0.47020649292278255';

describe('the channels and the recipes', () => {
  it('has some thirty recipes, each channel of each in its range', () => {
    expect(RECIPE_NAMES.length).toBeGreaterThanOrEqual(30);
    for (const name of RECIPE_NAMES) {
      for (const [k, v] of Object.entries(RECIPES[name])) {
        const [lo, hi] = CHANNEL_RANGE[k as keyof typeof CHANNEL_RANGE];
        expect([name, k, v >= lo && v <= hi]).toEqual([name, k, true]);
      }
      const f = recipeFace(name);
      for (const k of FACE_CHANNELS)
        expect(f[k]).toBeGreaterThanOrEqual(CHANNEL_RANGE[k][0]);
    }
  });

  it('has the named recipes, asymmetric ones among them', () => {
    for (const name of [
      'joy',
      'delight',
      'smug',
      'amused',
      'embarrassed',
      'shy',
      'guilty',
      'suspicious',
      'sceptical',
      'annoyed',
      'furious',
      'disgust',
      'fear',
      'terror',
      'surprise',
      'shock',
      'sad',
      'heartbroken',
      'tender',
      'love',
      'determined',
      'bored',
      'confused',
      'thinking',
      'relieved',
      'sarcastic',
    ])
      expect(RECIPE_NAMES).toContain(name);
    const sceptical = recipeFace('sceptical');
    expect(sceptical.browOutR - sceptical.browOutL).toBeGreaterThan(6);
    expect(Math.abs(recipeFace('smug').skew)).toBeGreaterThan(0.5);
  });

  it('keeps every recipe apart: no two the same face', () => {
    const seen = new Set<string>();
    for (const name of RECIPE_NAMES) {
      const key = JSON.stringify(recipeFace(name));
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('wears a recipe at any strength: none is rest, full is the recipe', () => {
    expect(recipeFace('furious', 0)).toEqual(NEUTRAL_FACE);
    const half = recipeFace('furious', 0.5);
    expect(half.browInL).toBeCloseTo(RECIPES.furious.browInL / 2);
  });

  it('blends two recipes: 70% joy and 30% embarrassed lies between them', () => {
    const joy = recipeFace('joy');
    const shy = recipeFace('embarrassed');
    const mix = mixRecipes([
      ['joy', 0.7],
      ['embarrassed', 0.3],
    ]);
    for (const k of FACE_CHANNELS)
      expect(mix[k]).toBeCloseTo(joy[k] * 0.7 + shy[k] * 0.3);
    const blended = blendFaces(joy, shy, 0.3);
    for (const k of FACE_CHANNELS) expect(blended[k]).toBeCloseTo(mix[k]);
    expect(mixRecipes([])).toEqual(NEUTRAL_FACE);
  });

  it('maps every old face onto a recipe, and every recipe back to the nearest old face', () => {
    for (const face of [...EXPRESSIONS, 'pain', 'eyes closed'])
      expect(RECIPE_NAMES).toContain(RECIPE_OF_FACE[face]);
    for (const name of RECIPE_NAMES)
      expect([...EXPRESSIONS, 'pain', 'eyes closed']).toContain(
        FACE_OF_RECIPE[name],
      );
    expect(RECIPE_OF_FACE.happy).toBe('joy');
    expect(RECIPE_OF_FACE.afraid).toBe('fear');
  });

  it('draws the old faces as FACES drew them: the same brows, lids, pupils', () => {
    for (const name of EXPRESSIONS) {
      const f = FACES[name];
      const c = recipeFace(RECIPE_OF_FACE[name]);
      expect([name, c.lookX, c.lookY, c.pupil]).toEqual([
        name,
        f.look[0],
        f.look[1],
        f.pupil,
      ]);
      if (f.brows && !f.browRight)
        expect([name, c.browOutL || 0, c.browInL || 0]).toEqual([
          name,
          -f.brows[0] || 0,
          -f.brows[1] || 0,
        ]);
    }
  });

  it("reads a writer's words for a feeling", () => {
    expect(recipeNamed('smirking')).toBe('smug');
    expect(recipeNamed('livid')).toBe('furious');
    expect(recipeNamed('Scared')).toBe('fear');
    expect(recipeNamed('happy')).toBe('joy');
    expect(recipeNamed('purple')).toBeNull();
  });
});

describe('said versus felt: the eyes tell the truth', () => {
  it('keeps the mouth of what is said and the eyes and brows of what is felt', () => {
    const joy = recipeFace('joy');
    const bored = recipeFace('bored');
    const sarcasm = saidAndFelt(joy, bored);
    expect(sarcasm.smile).toBeGreaterThan(0.6);
    expect(sarcasm.lidL).toBe(bored.lidL);
    expect(sarcasm.lower).toBe(bored.lower);
    expect(sarcasm.browOutL).toBe(bored.browOutL);
    // A brave face over fear: set jaw, frightened eyes.
    const brave = saidAndFelt(recipeFace('determined'), recipeFace('fear'));
    expect(brave.wide).toBe(recipeFace('fear').wide);
    expect(brave.pupil).toBe(recipeFace('fear').pupil);
    expect(brave.width).toBeLessThan(0);
  });

  it('plays a smile over sadness, a dodge as a lie, and a sheet that says both', () => {
    const calm = temperOf([]);
    expect(lineFace({ aim: 'comforts' }, calm, 'sad')).toEqual({
      said: 'tender',
      felt: 'sad',
      how: 'ease',
      lie: false,
    });
    expect(lineFace({ aim: 'dodges' }, calm, 'neutral')).toMatchObject({
      said: 'amused',
      felt: 'guilty',
      lie: true,
    });
    expect(lineFace({ aim: 'warns' }, calm, 'afraid')?.said).toBe('worried');
    expect(lineFace({ aim: 'refuses' }, calm, 'afraid')).toMatchObject({
      said: 'determined',
      felt: 'fear',
    });
    expect(
      lineFace({ aim: 'says' }, calm, null, { said: 'joy', felt: 'bored' }),
    ).toMatchObject({ said: 'joy', felt: 'bored', lie: false });
    expect(lineFace({ aim: 'accuses' }, calm, 'angry')?.how).toBe('slow');
    expect(lineFace({ aim: 'asks' }, calm, 'angry')?.said).toBe('angry');
  });

  it('shows what is felt through a said face on the track', () => {
    const key: FaceKey = [0, 'joy', 1, 'sad', 'ease', 2000];
    const { c } = trackAt([key], 1500, NEUTRAL_FACE);
    expect(c.smile).toBeGreaterThan(0.5);
    expect(c.lookY).toBe(recipeFace('sad').lookY);
    expect(c.lidTilt).toBeLessThan(-0.5);
  });
});

describe('reactions, varied and in character', () => {
  it('takes lines like the last with the same face again, not a new one each time', () => {
    const proud = temperOf(['proud']);
    const aims: LineAim[] = ['jokes', 'jokes', 'jokes', 'teases', 'teases'];
    let last: string | null = null;
    const taken: string[] = [];
    for (const [i, aim] of aims.entries()) {
      const r = reactionFace(aim, proud, (i * 0.37) % 1, last);
      taken.push(r!.recipe);
      last = r?.recipe ?? null;
    }
    // Three jokes, one face; the teases, one of the faces it takes a tease with.
    expect(new Set(taken.slice(0, 3)).size).toBe(1);
    expect(taken[3]).toBe(taken[4]);
  });

  it('rolls the eyes only with the face that rolls them', () => {
    const proud = temperOf(['proud']);
    for (let pick = 0; pick < 1; pick += 0.1) {
      const r = reactionFace('jokes', proud, pick)!;
      expect(r.glance === '@up').toBe(r.recipe === 'exasperated');
    }
    expect(reactionFace('praises', temperOf(['shy']), 0)?.glance).toBe('@down');
  });
});

describe('timing', () => {
  const key: FaceKey = [1000, 'surprise', 1, null, 'ease', 1500];

  it('eases a face on, the brows first and the mouth last, and gives it back', () => {
    const at = (t: number) => trackAt([key], t, NEUTRAL_FACE).c;
    expect(at(900)).toEqual(NEUTRAL_FACE);
    const early = at(1080);
    expect(early.browInL).toBeGreaterThan(0.5);
    expect(early.open).toBeLessThan(0.02);
    const on = at(2000);
    expect(on.browInL).toBeCloseTo(RECIPES.surprise.browInL);
    expect(on.round).toBeCloseTo(RECIPES.surprise.round);
    expect(at(3500)).toEqual(NEUTRAL_FACE);
  });

  it('winds a take up the other way and overshoots it', () => {
    const take: FaceKey = [0, 'shock', 1, null, 'take', 2000];
    const at = (t: number) => trackAt([take], t, NEUTRAL_FACE).c;
    expect(at(40).browInL).toBeLessThan(0);
    const most = Math.max(...[150, 200, 250, 300].map((t) => at(t).browOutL));
    expect(most).toBeGreaterThan(RECIPES.shock.browOutL * 0.99);
  });

  it('goes from one acted face to the next without passing through rest', () => {
    const a: FaceKey = [0, 'joy', 1, null, 'ease', 1500];
    const b: FaceKey = [1000, 'sad', 1, null, 'ease', 1500];
    const mid = trackAt([a, b], 1100, NEUTRAL_FACE).c;
    expect(mid.smile).toBeGreaterThan(0.3);
  });

  it('blinks at natural intervals, on its own beat, and as a thought changes', () => {
    const shut = (seed: string, cues: number[] = []) => {
      const out: number[] = [];
      for (let t = 0; t < 20_000; t += 10)
        if (blinkAt(seed, t, cues) >= 0.97 && !out.some((x) => t - x < 300))
          out.push(t);
      return out;
    };
    const ada = shut('ada');
    expect(ada.length).toBeGreaterThanOrEqual(4);
    expect(ada.length).toBeLessThanOrEqual(9);
    expect(shut('bea')).not.toEqual(ada);
    const cued = shut('ada', [7000]);
    expect(
      cued.some((t) => t >= 7000 && t < 7000 + BLINK_MS.down + BLINK_MS.shut),
    ).toBe(true);
  });

  it('is seek-exact: a moment is the same however it is reached', () => {
    const track: FaceKey[] = [
      [500, 'thinking', 1, null, 'ease', 3000],
      [4000, 'amused', 1, 'guilty', 'ease', 2000],
    ];
    const moment = (t: number) =>
      faceAt({ seed: 'ada', t, base: NEUTRAL_FACE, track, cues: [200] });
    const played: string[] = [];
    for (let t = 0; t < 7000; t += 33) played.push(JSON.stringify(moment(t)));
    const jumped: string[] = [];
    for (let t = 6996; t >= 0; t -= 33)
      jumped.unshift(JSON.stringify(moment(t)));
    expect(jumped).toEqual(played);
  });

  it('darts the eyes while thinking and over a lie, and not at rest', () => {
    const track: FaceKey[] = [[0, 'thinking', 1, null, 'ease', 10_000]];
    const looks = new Set<string>();
    for (let t = 400; t < 4000; t += 250) {
      const f = faceAt({ seed: 'ada', t, base: NEUTRAL_FACE, track });
      looks.add(`${f.lookX.toFixed(1)},${f.lookY.toFixed(1)}`);
    }
    expect(looks.size).toBeGreaterThan(3);
    const still = new Set<string>();
    for (let t = 400; t < 4000; t += 250) {
      const f = faceAt({ seed: 'ada', t, base: NEUTRAL_FACE });
      still.add(`${f.lookX},${f.lookY}`);
    }
    expect(still.size).toBe(1);
  });

  it('opens the mouth to the words, keeping the face’s own corners', () => {
    const joy = recipeFace('joy');
    expect(withViseme(joy, 0).open).toBe(0);
    expect(withViseme(joy, 2).open).toBeGreaterThan(0.6);
    expect(withViseme(joy, 4).round).toBeGreaterThan(0.8);
    expect(withViseme(joy, 1).smile).toBeGreaterThan(0.6);
  });
});

describe('the geometry', () => {
  it('draws the face at rest as the kit drew its neutral face', () => {
    const p = faceParts(NEUTRAL_FACE, FRONT);
    // No brows, no lids, no marks: shown as nothing.
    expect(p.bs.opacity).toBe('0');
    expect(p.up0.d).toBe('');
    expect(p.lo0.d).toBe('');
    expect(p.cv0.opacity).toBe('0');
    expect(p.wh0.opacity).toBe('0');
    expect(p.sw.opacity).toBe('0');
    // The pupils where neutral's are.
    expect(p.p0).toEqual({
      cx: String(-R.eyes.dx),
      cy: String(R.eyes.y + 2),
      r: '3.4',
    });
    // The mouth: the kit's flat curve, M-9,my Q0,my+2.5 9,my, as a cubic, a line 3 wide.
    const my = R.mouthY;
    expect(p.m.d).toBe(
      `M-9,${my} C-3,${my + 1.67} 3,${my + 1.67} 9,${my} C3,${my + 1.67} -3,${my + 1.67} -9,${my} Z`,
    );
    expect(p.mo['stroke-width']).toBe('3');
  });

  it('is deterministic, and its print is the one the player checks', () => {
    expect(faceRigPrint()).toBe(PRINT);
    expect(
      faceMarkup(recipeFace('smug'), FRONT, {
        eyesClip: 'eyes',
        halfClip: 'h',
        prefix: 'p',
        skin: '#c68642',
      }),
    ).toBe(
      faceMarkup(recipeFace('smug'), FRONT, {
        eyesClip: 'eyes',
        halfClip: 'h',
        prefix: 'p',
        skin: '#c68642',
      }),
    );
  });

  it('writes a view’s geometry on its group and reads it back', () => {
    expect(geoOfAttr(geoAttr(FRONT))).toEqual(FRONT);
  });

  it('keeps the ink the kit’s', () => {
    expect(
      faceMarkup(NEUTRAL_FACE, FRONT, {
        eyesClip: 'e',
        halfClip: 'h',
        prefix: 'p',
        skin: '#fff',
      }),
    ).toContain(FIGURE_INK);
  });
});

describe('a drawing with a face of moving parts', () => {
  const plain = drawFigure(SPEC, 'ada', { rig: 3 });
  const rigged = drawFigure(SPEC, 'ada', { rig: 3, faceRig: true });

  it('is drawn as before without asking for it', () => {
    expect(plain.svg).not.toContain('class="rf"');
    expect(plain.faceRig).toBeUndefined();
    expect(drawFigure(SPEC, 'ada', { rig: 3 }).svg).toBe(plain.svg);
  });

  it('asked for it, has a rigged face in each view the face shows in, hidden until the player moves it', () => {
    expect(rigged.faceRig).toBe(true);
    for (const id of ['rigface', 'rigface--3q', 'rigface--profile'])
      expect(rigged.svg).toContain(`id="${id}" class="rf"`);
    expect(rigged.svg).not.toContain('rigface--back');
    expect(rigged.svg).toContain(
      '.rf{display:none}.rigged .rf{display:inline}',
    );
    // Its old faces are still drawn, for a still and an older player.
    for (const name of EXPRESSIONS)
      expect(rigged.svg).toContain(`id="${name}"`);
    expect(drawFigure(SPEC, 'ada', { rig: 3, faceRig: true }).svg).toBe(
      rigged.svg,
    );
  });

  it('takes a face into every view for a still, the old faces hidden', () => {
    const svg = withRigFace(rigged.svg, recipeFace('furious'), ['neutral']);
    expect(svg).toContain('.rf{display:inline}');
    expect(svg).toContain('[id="neutral"]{display:none}');
    expect(svg.match(/data-k="vn"[^>]*opacity="1"/g)?.length).toBe(3);
    expect(withRigFace(plain.svg, recipeFace('furious'))).toBe(plain.svg);
  });
});

describe('acting a film with faces', () => {
  const step = (atMs: number, show: string[]): SceneStepDto => ({
    atMs,
    layout: 'row',
    show,
    arrows: [],
    enter: {},
    focus: null,
  });
  const said = (
    speaker: string,
    text: string,
    startMs: number,
    to: string,
  ): SpokenLine => {
    const list = text.split(' ').map((word, i) => ({
      text: word,
      startMs: startMs + i * 300,
      endMs: startMs + i * 300 + 260,
    }));
    return {
      speaker,
      to,
      startMs,
      endMs: list[list.length - 1].endMs,
      words: list,
    };
  };
  const act = (worn?: (id: string, t: number) => string | null) =>
    actingOf({
      actors: ['sam', 'alex'],
      names: new Map([
        ['sam', ['Sam']],
        ['alex', ['Alex']],
      ]),
      steps: [step(0, ['sam', 'alex'])],
      lines: [
        said('sam', 'You took my shoe!', 1000, 'alex'),
        said('alex', 'Um, who, me? No idea.', 3500, 'sam'),
        said('sam', 'Knock knock, just kidding.', 7000, 'alex'),
      ],
      narration: [],
      directed: [],
      durationMs: 12_000,
      walks: true,
      film: true,
      felt: [],
      traits: new Map([['alex', ['shy']]]),
      ...(worn ? { worn } : {}),
    });

  it('acts no faces where it is not asked (a book, an older make)', () => {
    const acting = act();
    expect(acting.sam.face).toBeUndefined();
  });

  it('acts each line’s face, a lie’s flash, and the listener’s reaction, sorted', () => {
    const acting = act(() => 'neutral');
    const sam = acting.sam.face!;
    const alex = acting.alex.face!;
    expect(sam.some(([, r, , , how]) => r === 'angry' && how === 'slow')).toBe(
      true,
    );
    // A shy one accused: a guilty take, eyes down.
    expect(
      alex.some(
        ([, r, , , how]) =>
          (r === 'guilty' || r === 'embarrassed' || r === 'fear') &&
          how === 'take',
      ),
    ).toBe(true);
    // Alex dodges: a flash of fear, then an innocent smile over it.
    const flash = alex.find(([, , , , how]) => how === 'flash');
    expect(flash?.[1]).toBe('fear');
    expect(
      alex.some(([, r, , felt]) => r === 'amused' && felt === 'fear'),
    ).toBe(true);
    for (const track of [sam, alex])
      expect([...track].sort((a, b) => a[0] - b[0])).toEqual(track);
    expect(act(() => 'neutral')).toEqual(acting);
  });

  it('shows the faces in a still of the scene, as the player would', () => {
    const acting = act(() => 'neutral');
    const scene = {
      effects: [{ atMs: 0, target: 'sam', part: 'angry', do: 'show' }],
      acting,
    } as unknown as Parameters<typeof faceInScene>[0];
    const at = faceInScene(scene, 'sam', 2600);
    expect(at.furrow + Math.abs(at.browInL)).toBeGreaterThan(3);
    expect(faceInScene(scene, 'sam', 2600)).toEqual(at);
  });
});
