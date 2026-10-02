import { bibleOf, briefOf, EMPTY_BIBLE } from './studio';
import { castWorkOf, chosen, NO_WORK, withOptions } from './studio-drawings';
import {
  HOST_FACES,
  HOST_ID,
  hostFaces,
  hostIn,
  hostLooks,
  hostOn,
  newHost,
  withHost,
} from './studio-host';

/**
 * A show's host (studio-explainer-plan, Ask 9, idea 4): on for children,
 * off for grown-ups, drawn by the kits, picked by the maker from three
 * looks on the choosing card, kept across episodes, and one of the show's
 * characters so a clip may cast them.
 */
describe('hostOn', () => {
  const brief = (said: Record<string, unknown>) =>
    briefOf({ format: 'explainer', idea: 'Day and night', ...said });

  it("is on for children and off for grown-ups by the audience's recipe", () => {
    expect(hostOn(brief({ who: { band: 'primary-upper' } }))).toBe(true);
    expect(hostOn(brief({ audience: 'young children' }))).toBe(true);
    expect(hostOn(brief({ who: { band: 'university' } }))).toBe(false);
    expect(hostOn(brief({ audience: 'adults' }))).toBe(false);
  });

  it("follows the maker's word either way, and is never a story's", () => {
    expect(hostOn(brief({ audience: 'adults', host: true }))).toBe(true);
    expect(hostOn(brief({ audience: 'children', host: false }))).toBe(false);
    expect(
      hostOn(
        briefOf({ format: 'story', idea: 'A kite', audience: 'children' }),
      ),
    ).toBe(false);
  });

  it("keeps the maker's word on the brief", () => {
    const off = briefOf({ host: false }, brief({ audience: 'children' }));
    expect(off.host).toBe(false);
    expect(briefOf({ idea: 'more' }, off).host).toBe(false);
  });
});

describe('the host', () => {
  it('offers three looks, a person and two animals the kits draw, the same for a show every time and varied between shows', () => {
    const looks = hostLooks('show-1');
    expect(looks).toHaveLength(3);
    expect(looks[0].figure).toBeDefined();
    expect(looks[1].animal?.species).toBe('owl');
    expect(looks[2].animal).toBeDefined();
    expect(hostLooks('show-1')).toEqual(looks);
    const names = new Set(
      Array.from({ length: 12 }, (_, i) => newHost(`show-${i}`).name),
    );
    expect(names.size).toBeGreaterThan(3);
  });

  it('is added to a bible when on, kept as the maker had them, and taken out when off', () => {
    const made = withHost(EMPTY_BIBLE, null, true, 's1');
    expect(made.fresh).toBe(true);
    expect(hostIn(made.bible)).toMatchObject({
      id: HOST_ID,
      kind: 'person',
      host: true,
    });

    // Written again (a new episode): the cast writer knows nothing of them; they are kept.
    const picked = {
      ...made.bible,
      characters: made.bible.characters.map((c) => ({ ...c, name: 'Kit' })),
    };
    const again = withHost(
      bibleOf({ characters: [{ name: 'Nurse Amara' }] }),
      picked,
      true,
      's1',
    );
    expect(again.fresh).toBe(false);
    expect(again.bible.characters.map((c) => c.name)).toEqual([
      'Kit',
      'Nurse Amara',
    ]);

    const off = withHost(again.bible, again.bible, false, 's1');
    expect(hostIn(off.bible)).toBeNull();
    expect(off.bible.characters.map((c) => c.name)).toEqual(['Nurse Amara']);
  });

  it('keeps being the host when read back', () => {
    const { bible } = withHost(EMPTY_BIBLE, null, true, 's1');
    expect(hostIn(bibleOf(JSON.parse(JSON.stringify(bible))))?.host).toBe(true);
  });

  it('becomes an owl, and a person again, as the maker picks on the choosing card', () => {
    const { bible } = withHost(EMPTY_BIBLE, null, true, 's1');
    const looks = hostLooks('s1');
    const work = castWorkOf(
      JSON.parse(
        JSON.stringify(
          withOptions(
            NO_WORK,
            HOST_ID,
            looks.map((one) => ({ ...one })),
            '',
            1,
            true,
          ),
        ),
      ),
    );
    const options = work.candidates[HOST_ID].options;
    expect(options).toHaveLength(3);
    const owl = chosen(bible, {}, work, HOST_ID, options[1].id)!;
    const host = hostIn(owl.bible)!;
    expect(host).toMatchObject({
      kind: 'animal',
      figure: null,
      size: 'small',
      look: looks[1].look,
    });
    expect(host.animal?.species).toBe('owl');
    expect(owl.work.candidates[HOST_ID]).toBeUndefined();

    const back = chosen(
      owl.bible,
      {},
      withOptions(
        owl.work,
        HOST_ID,
        looks.map((one) => ({ ...one })),
        '',
        2,
        true,
      ),
      HOST_ID,
      1,
    )!;
    const person = hostIn(back.bible)!;
    expect(person.kind).toBe('person');
    expect(person.animal).toBeUndefined();
    expect(person.figure).toEqual(looks[0].figure);
  });

  it("is drawn for the player's corner in each of its faces, a person's with its rigged face", () => {
    const person = newHost('s1');
    const faces = hostFaces(person)!;
    expect(Object.keys(faces)).toEqual([...HOST_FACES]);
    expect(faces.neutral).toMatch(/^<svg/);
    expect(faces.neutral).toMatch(/class="rf"/);
    const owl = {
      ...person,
      kind: 'animal' as const,
      figure: null,
      animal: hostLooks('s1')[1].animal,
    };
    expect(hostFaces(owl)?.happy).toMatch(/^<svg/);
    expect(hostFaces({ ...person, figure: null })).toBeNull();
  });
});
