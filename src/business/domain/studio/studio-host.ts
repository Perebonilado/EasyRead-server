/**
 * A show's host (studio-explainer-plan, Ask 9, idea 4): one face for an
 * explainer, drawn by the kits and so free. A person the figure kit draws,
 * or an animal the animal kit does; the maker picks from three on the
 * thread's choosing card (the first in use until they do). The host opens
 * the film, asks its checkpoint questions from a corner and reacts to the
 * answer, and, being one of the show's characters, may act in its story
 * clips (studio-clip).
 *
 * On by default for children (the audience recipe's `mascot`), off for
 * grown-ups; the brief's `host` says otherwise when the maker does.
 *
 * Pure: no model, no I/O.
 */
import { createHash } from 'node:crypto';
import { animalOf, type AnimalSpec, type AnimalSpecies } from '../scene-animal';
import { figureFor, type FigureFace, type FigureSpec } from '../scene-figure';
import { recipeOf } from './studio-audience';
import { animalPreview, figurePreview, figureRigged } from './studio-looks';
import type { StudioBible, StudioBrief, StudioCharacter } from './studio';

/** The host's id in every show that has one. */
export const HOST_ID = 'host';

/** Whether a show has a host: the maker's word, else its audience's recipe; never a story's. */
export function hostOn(
  brief: Pick<StudioBrief, 'format' | 'audience' | 'who' | 'host'>,
): boolean {
  if (brief.format !== 'explainer') return false;
  if (typeof brief.host === 'boolean') return brief.host;
  return recipeOf(brief)?.mascot ?? false;
}

/** A show's host, when it has one. */
export const hostIn = (
  bible: Pick<StudioBible, 'characters'> | null | undefined,
): StudioCharacter | null =>
  bible?.characters.find((c) => c.host === true) ?? null;

/** A number from 0 to 1 from a seed: the same seed, the same number. */
const unit = (seed: string) =>
  createHash('sha1').update(seed).digest().readUInt32BE(0) / 0x1_0000_0000;
const pick = <T>(list: readonly T[], seed: string): T =>
  list[Math.floor(unit(seed) * list.length) % list.length];

/** Short names that read in any language, none of one place. */
export const HOST_NAMES = [
  'Juno',
  'Kit',
  'Nova',
  'Remi',
  'Tam',
  'Ollie',
  'Suki',
  'Milo',
  'Zara',
  'Ari',
  'Bo',
  'Lumi',
] as const;

/** The animals a host may be, beside the owl: friendly, and easy to read small. */
const HOST_ANIMALS: readonly AnimalSpecies[] = [
  'fox',
  'rabbit',
  'monkey',
  'turtle',
  'cat',
  'dog',
];

/** One way the host may look: a person's figure, or an animal's spec. */
export interface HostLook {
  figure?: FigureSpec;
  animal?: AnimalSpec;
  /** In a few words, for the cast's card and the writers. */
  look: string;
}

/**
 * The three the maker picks from, the same for a show every time: a
 * person (a friendly grown-up guide, glasses on), an owl in a bow, and one
 * more animal in a scarf. Varied by the show, never one look for all.
 */
export function hostLooks(seed: string): HostLook[] {
  const person = figureFor(`${seed}:host`, {
    age: 'adult',
    top: pick(
      ['cardigan', 'jumper', 'shirt and tie', 'jacket'] as const,
      `${seed}:top`,
    ),
    extras: ['glasses'],
  });
  const colour = pick(
    ['red', 'teal', 'yellow', 'purple', 'orange'] as const,
    `${seed}:wear`,
  );
  const owl = animalOf({
    species: 'owl',
    size: 'small',
    wear: { neck: 'bow' },
    wearColour: colour,
  });
  const species = pick(HOST_ANIMALS, `${seed}:animal`);
  const other = animalOf({
    species,
    size: 'small',
    wear: { neck: 'scarf' },
    wearColour: colour,
  });
  return [
    { figure: person, look: 'a friendly grown-up guide in glasses' },
    ...(owl ? [{ animal: owl, look: `a small owl in a ${colour} bow` }] : []),
    ...(other
      ? [{ animal: other, look: `a small ${species} in a ${colour} scarf` }]
      : []),
  ];
}

/** The host as a new show has them: its first look (the person), a name of the show's. */
export function newHost(seed: string): StudioCharacter {
  const [first] = hostLooks(seed);
  return {
    id: HOST_ID,
    name: pick(HOST_NAMES, `${seed}:name`),
    kind: 'person',
    role: 'supporting',
    look: first.look,
    figure: first.figure ?? null,
    size: null,
    voice: 'woman',
    voicePick: 0,
    traits: ['warm', 'curious', 'encouraging'],
    carries: null,
    host: true,
  };
}

/**
 * A bible with its host as the brief has it: kept as the show had them
 * (the maker's pick included) when on, a new one when on and none, none
 * when off. Whether the host is new, to offer the maker the three looks.
 */
export function withHost(
  bible: StudioBible,
  before: StudioBible | null,
  on: boolean,
  seed: string,
): { bible: StudioBible; fresh: boolean } {
  const others = bible.characters.filter(
    (c) => c.host !== true && c.id !== HOST_ID,
  );
  if (!on) return { bible: { ...bible, characters: others }, fresh: false };
  const kept = hostIn(before) ?? hostIn(bible);
  return {
    bible: { ...bible, characters: [kept ?? newHost(seed), ...others] },
    fresh: !kept,
  };
}

/** How the host looks in the corner: at rest, pleased, thinking, surprised. */
export const HOST_FACES = [
  'neutral',
  'happy',
  'thinking',
  'surprised',
] as const satisfies readonly FigureFace[];
export type HostFace = (typeof HOST_FACES)[number];

/** How the host is described to the outline's writer, so a clip may cast them. */
export const hostWords = (host: StudioCharacter) =>
  `${host.name} (id "${host.id}") is the show's host, who opens each film and asks its questions; they may act in a story clip too.`;

/**
 * The host as the player shows them in its corner: each face drawn by the
 * kit (a person's with its rigged face, which the player moves; an
 * animal's as its kit swaps them). Null for one no kit draws.
 */
export function hostFaces(
  host: StudioCharacter,
): Record<HostFace, string> | null {
  const draw =
    host.kind === 'animal' && host.animal
      ? (face: HostFace) =>
          animalPreview(host.animal!, `${host.id}-corner`, face)
      : host.kind === 'person' && host.figure
        ? (face: HostFace) =>
            figurePreview(host.figure!, `${host.id}-corner`, face)
        : null;
  if (!draw) return null;
  const faces = Object.fromEntries(
    HOST_FACES.map((face) => [face, draw(face)]),
  ) as Record<HostFace, string>;
  // A person at rest with their rigged face, which the player moves; the
  // kit's faces beside it for a player that does not.
  const rigged =
    host.kind === 'person' && host.figure
      ? figureRigged(host.figure, `${host.id}-corner`)
      : null;
  return rigged ? { ...faces, neutral: rigged } : faces;
}
