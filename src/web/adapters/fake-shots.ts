/**
 * The shot board, offline (FakeLlmAdapter): a plan read from the call's
 * own parts (shot-board's), the same every time, nothing spent. Each line
 * gets the shot the decision table gives it where the scene's list has
 * what it needs: the portrait of a person it names, or a photo the list
 * says shows what it names (real pictures first); a count of a number the
 * line rests on; the map with a pin on a place it names (or a region
 * filling); a quote of a quote claim for exact words; the calendar of the
 * date a line about when rests on; a flow for a "why"; any other line
 * carries the shot before it on. Code holds it to the rules, as it holds
 * a model's.
 */

interface FakeLine {
  say: string;
  about: string;
  claims: string[];
}

/** The scene's lines, as the parts list them. */
function linesOf(all: string): FakeLine[] {
  return [
    ...all.matchAll(/^\d+\. say: (.+)\n\s+about: ([\w-]+) · claims: (.*)$/gmu),
  ].map((m) => ({
    say: m[1].trim(),
    about: m[2],
    claims: m[3].trim() === 'none' ? [] : m[3].split(/,\s*/u),
  }));
}

/** A line's first words: where its shot starts. */
const first = (say: string) => say.split(/\s+/u).slice(0, 3).join(' ');

/** A name's words, as matched in a line. */
const keys = (text: string) =>
  text
    .toLowerCase()
    .replace(/['’]s\b/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const says = (line: string, name: string) =>
  ` ${keys(line)} `.includes(` ${keys(name)} `);

/** Words of a line worth a step's label: not the small ones. */
const SMALL = new Set(
  'a an the of to in on at by for from with and or but so is was were are be it its that this as into then than because'.split(
    ' ',
  ),
);

export function fakeShotsAnswer(
  parts: readonly string[],
  look: 'editorial' | 'illustrated' = 'editorial',
): Record<string, unknown> {
  const all = parts.join('\n');
  // An illustrated show's people are its characters (WP17).
  const characters =
    look === 'illustrated' && /^- character\.group:/mu.test(all);
  const lines = linesOf(all);
  const pins = [...all.matchAll(/^- place:(.+?) \[pin\]/gmu)].map((m) => m[1]);
  const regions = [
    ...all.matchAll(/^- region:(.+?)(?: \(colour [^)]*\))?$/gmu),
  ].map((m) => m[1]);
  const numbers = [
    ...all.matchAll(/^- (number:.+?): (.+?)(?: · (.+))?$/gmu),
  ].map((m) => ({
    name: m[1],
    value: Number(/-?\d[\d,]*(?:\.\d+)?/u.exec(m[2])?.[0].replace(/,/gu, '')),
    claims: (m[3] ?? '').split(/,\s*/u),
  }));
  const quotes = [...all.matchAll(/^- claim:(c\d+) \(quote\): (.+)$/gmu)].map(
    (m) => ({
      id: m[1],
      text: /[“"]([^”"]{8,})(?:[”"]|$)/u.exec(m[2])?.[1] ?? m[2],
    }),
  );
  const portraits = [...all.matchAll(/^- person:(.+?) \[portrait\]/gmu)].map(
    (m) => m[1],
  );
  const photos = [
    ...all.matchAll(/^- (photo:.+?): shows (?:person|place):(.+?) · /gmu),
  ].map((m) => ({ name: m[1], shows: m[2] }));
  const dates = [...all.matchAll(/^- date:(.+?): .+? · (.+)$/gmu)].map((m) => ({
    when: m[1],
    claims: m[2].split(/,\s*/u),
  }));
  const shots = lines.flatMap((line): Record<string, unknown>[] => {
    const on = first(line.say);
    // Real pictures first: a person's portrait, else a photo of what the line names.
    const person = portraits.find(
      (p) => says(line.say, p) || says(line.say, p.split(' ').pop() ?? p),
    );
    if (person)
      return [
        {
          on,
          set: { kind: 'portrait', person: `person:${person}` },
          info: [],
          camera: [{ move: 'push', amount: 'small', on }],
          life: [],
          join: 'cut',
          focal: `person:${person}`,
        },
      ];
    const photo = photos.find((p) => says(line.say, p.shows));
    if (photo)
      return [
        {
          on,
          set: { kind: 'photo', photo: photo.name },
          info: [],
          camera: [{ move: 'push', amount: 'small', on }],
          life: [],
          join: 'cut',
          focal: 'set',
        },
      ];
    const number = numbers.find(
      (n) =>
        Number.isFinite(n.value) &&
        n.claims.some((c) => line.claims.includes(c)),
    );
    if (number)
      return [
        {
          on,
          set: {
            kind: 'chart',
            chart: {
              kind: 'counter',
              counter: {
                value: number.value,
                unit: null,
                prefix: null,
                label: null,
                then: null,
              },
            },
          },
          info: [{ recipe: 'count', target: number.name, on }],
          camera: [],
          life: [],
          join: 'cut',
          focal: 'set',
        },
      ];
    const place = pins.find((p) => says(line.say, p));
    const region = regions.find((r) => says(line.say, r.split(' ')[0]));
    if (place || region) {
      const target = place ? `place:${place}` : `region:${region}`;
      // People gathered there, when the kit has crowds: counted by the line's own number.
      const gathered =
        place &&
        (characters || /^- people\.crowd:/mu.test(all)) &&
        /\b(crowds?|people|gathered|marched|protesters|workers|soldiers|armies|army|legions?)\b/iu.test(
          line.say,
        );
      const said =
        /\b(\d{1,3}(?:,\d{3})+|\d+)\s+(?:[a-z]+\s+)?(?:people|workers|protesters|marchers)\b/iu.exec(
          line.say,
        )?.[1];
      return [
        {
          on,
          set: { kind: 'map', tilt: 'flat' },
          ...(gathered && characters
            ? {
                actors: [
                  {
                    id: 'people',
                    kit: 'character.group',
                    place: target,
                    dress: line.say.slice(0, 80),
                    count: 3,
                    pose: /march/iu.test(line.say) ? 'marching' : 'standing',
                    moves: [{ move: 'enter', on }],
                  },
                ],
              }
            : gathered
              ? {
                  actors: [
                    {
                      id: 'crowd',
                      kit: 'people.crowd',
                      place: target,
                      pose: /march|protest/iu.test(line.say)
                        ? 'protest'
                        : 'standing',
                      count: said ? Number(said.replace(/,/gu, '')) : null,
                      moves: [{ move: 'enter', on }],
                    },
                  ],
                }
              : {}),
          info: [{ recipe: place ? 'pin' : 'fill', target, on }],
          camera: [{ move: 'push', target, amount: 'small', on }],
          life: ['cloud-shadows'],
          join: 'cut',
          focal: target,
        },
      ];
    }
    const date = dates.find((d) =>
      d.claims.some((c) => line.claims.includes(c)),
    );
    if (line.about === 'when' && date)
      return [
        {
          on,
          set: {
            kind: 'chart',
            chart: {
              kind: 'calendar',
              calendar: {
                calendars: [{ label: null, dates: [date.when] }],
                merge: null,
              },
            },
          },
          info: [],
          camera: [{ move: 'establish', on }],
          life: [],
          join: 'cut',
          focal: 'set',
        },
      ];
    const quote = quotes.find((q) => line.claims.includes(q.id));
    if (line.about === 'exact-words' && quote)
      return [
        {
          on,
          set: {
            kind: 'chart',
            chart: {
              kind: 'quote',
              quote: {
                text: quote.text,
                speaker: null,
                when: null,
                claim: quote.id,
              },
            },
          },
          info: [],
          camera: [],
          life: ['grain'],
          join: 'cut',
          focal: 'set',
        },
      ];
    if (line.about === 'why') {
      const words = line.say
        .replace(/[^\p{L}\p{N}\s’'-]+/gu, ' ')
        .split(/\s+/u)
        .filter((w) => w && !SMALL.has(w.toLowerCase()));
      if (words.length >= 2) {
        const [from, to] = [words[0], words[words.length - 1]];
        return [
          {
            on,
            set: {
              kind: 'chart',
              chart: {
                kind: 'flow',
                flow: {
                  direction: 'across',
                  nodes: [
                    { label: from, kind: 'start' },
                    { label: to, kind: 'end' },
                  ],
                  edges: [{ from, to, label: null }],
                },
              },
            },
            info: [
              { recipe: 'flow', target: `part:${from}`, to: `part:${to}`, on },
            ],
            camera: [],
            life: [],
            join: 'cut',
            focal: 'set',
          },
        ];
      }
    }
    return [];
  });
  return { shots };
}
