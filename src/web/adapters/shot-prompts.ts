/**
 * What the shot board is told (explainer_shots; explainer-animation-plan
 * §5.3): an editorial explainer's director, naming each shot from closed
 * lists and the scene's registry of true things, never writing a
 * coordinate, a time or a colour. The lists are the domain's own
 * (shot-lists), so the board is never offered what the stage cannot
 * show; the rules are the rules file's; the scene's registry and its
 * lines come with each call (shot-board's parts).
 *
 * Nothing here suggests a card of words, a stock person, the audience or
 * a place not in the registry: a line with nothing true to show holds
 * the picture before it, with the camera moving.
 */
import { RULES_PROMPT } from '../../business/domain/studio/explainer-rules';
import {
  CHART_KINDS,
  CHART_USES,
  DRAWN_SETS,
  JOIN_USES,
  LIFE_USES,
  MOVE_USES,
  RECIPE_USES,
  SET_KINDS,
  SET_LANDS,
  SET_TIMES,
  SET_TOWNS,
  SET_USES,
  SET_WEATHERS,
} from '../../business/domain/shots/shot-lists';
import { ICON_NAMES } from '../../business/domain/scene-icon-set';

const quoted = (list: readonly string[]) =>
  list.map((one) => `"${one}"`).join(', ');

/** A closed list with when each is used, a line each. */
const uses = (title: string, table: Record<string, string>) =>
  [title, ...Object.entries(table).map(([k, v]) => `- ${k}: ${v}`)].join('\n');

/**
 * How the board stands the kit's pieces on a set (kit/registry; research
 * §3.5): groups as silhouettes in their side's colour, counted honestly,
 * never a named person, never the audience. Which pieces a scene may use
 * comes with it (shot-board's kit part, for the show's look).
 */
export const KIT_GUIDE = [
  'Actors: pieces of the kit listed with the scene, standing on its set or on the map; at most four a shot, only where the line is about people or things that move in general.',
  '  - Groups of people are silhouettes in their side’s colour (side: a side’s name from the list). A crowd’s count is a number the list or the line gives, or none: never a number of your own.',
  '  - A silhouette never stands for a named person: a named person is their portrait or a trace of them. One person or a pair only for an unnamed role the line speaks of (a voter, a worker), never on a line that names someone.',
  '  - Never the audience, a viewer, a student or a host.',
  '  - A vehicle carries what the line says moves (goods, people, an army), of its era.',
  '  - Each actor: id (your name for it), kit, place (a place of the list on the map, a part of the set, or left, centre, right, foreground, background), side, its settings as fields (pose, kind, count, era, who, dress, facing, wagons: only those its kit has), and moves, each on its own exact words, with to (a place, a part, or left, right, off).',
  '  - For example: {"id": "marchers", "kit": "people.crowd", "place": "place:<a place>", "side": "<a side>", "pose": "protest", "count": <the number said>, "moves": [{"move": "enter", "on": "<exact words>"}]}',
].join('\n');

/** A chart's fields, by kind: the scene writer's own names, and how its parts are named. */
const CHART_GUIDE = [
  'A chart is one kind, its fields under the kind’s own name (a counter’s under "counter"), every other kind’s null. Its words and numbers come only from the list below. Name a part of it as part:<the words it shows>.',
  `- counter (${CHART_USES.counter}): counter.value as the list gives it, counter.unit ("km", "%", "million") or null, counter.prefix ("$", "about") or null, counter.label what it counts (one to three words), counter.then a later value or null. Parts: part:number, part:label.`,
  `- icons (${CHART_USES.icons}): icons.icon one of ${quoted(ICON_NAMES)}; icons.count, icons.per (how many one icon stands for, or null), icons.unit, icons.label, icons.highlight (a part of the count) and icons.highlightLabel, or null. Parts: part:icons, part:highlight.`,
  `- calendar (${CHART_USES.calendar}): calendar.calendars, one to three, each a label (one to three words) and its dates as the list writes them; calendar.merge or null. Parts: part:<a date>.`,
  `- seats (${CHART_USES.seats}): seats.layout "hemicycle" or "chamber"; seats.groups, each name, seats and colour; seats.majority; seats.label. Parts: part:<a group’s name>, part:majority.`,
  `- strike (${CHART_USES.strike}): strike.from and strike.to (one to three words each), strike.label or null. Parts: part:old, part:new.`,
  `- transfer (${CHART_USES.transfer}): transfer.from and transfer.to (one to three words each), transfer.token ("coin", "paper", "person" or "dot"), transfer.label or null, transfer.shut. Parts: part:<from>, part:<to>, part:tokens.`,
  `- document (${CHART_USES.document}): document.style "paper" or "newspaper", document.title, document.headline or null, document.stamp (one to three words) or null; only words the claims give. Parts: part:title, part:stamp.`,
  `- split (${CHART_USES.split}): split.sides, exactly two, each a label and items (one to three words each) and an icon or null. Parts: part:<a side’s label>, part:<an item>.`,
  `- chart (${CHART_USES.chart}): chart.kind "bar" or "line", chart.unit, chart.bars each a label and a value. Parts: part:<a bar’s label>.`,
  `- plot (${CHART_USES.plot}): plot.fn in x, plot.xFrom, plot.xTo, plot.yFrom, plot.yTo, plot.xLabel, plot.yLabel, plot.points. Parts: part:curve, part:<a point’s name>.`,
  `- timeline (${CHART_USES.timeline}): timeline, a list of {when, name}: dates as the list writes them, names one to three words. Parts: part:<a date>.`,
  `- flow (${CHART_USES.flow}): flow.direction "across", "down" or "cycle"; flow.nodes each a label (one to three words) and kind "step", "decision", "start" or "end"; flow.edges each from and to (node labels) and a label or null. Parts: part:<a step’s label>.`,
  `- quote (${CHART_USES.quote}): quote.text, the words exactly as a quote claim gives them; quote.speaker, quote.when, quote.claim (its claim’s id). Parts: part:speaker.`,
  'On any chart, source (where its numbers come from, a claim’s source) and colour (a colour of the list) or null.',
].join('\n');

/** The decision table (research §3.2's defaults by row kind). */
const DECIDE = [
  'Choose each line’s shot by what it is about. Each line comes with what the editor wants seen: take its idea, never a place, a person or a picture the list does not give.',
  '- a place: the map; travel or cut to the place, then pin it (a place marked [pin]) or fill its region; a seam for a border.',
  '- when: a timeline for several dates, a calendar for one or two, from the dates listed; on the map, a label of the year on the place it happened.',
  '- how many: a counter that counts a number of the list; icons for a count with its whole; bars for three or more numbers.',
  '- who: their portrait if marked [portrait]; else their trace (their own words as a quote, or their place pinned on the map); else show what they did, never them.',
  '- why: a flow from the cause to its effect, the wave travelling along it ("flow"); a transfer only where a claim says something moves from one to another.',
  '- a comparison: a split of the two sides.',
  '- exact words: a quote of a quote claim’s words.',
  '- many people (a crowd, workers, voters, migrants): the kit’s silhouettes in their side’s colour, on the map at their place or on a drawn set, counted only by a number the list or the line gives.',
  '- what moves people or goods (a train, a ship, a lorry): the kit’s vehicle of its era, travelling on the map or across a drawn set.',
  DRAWN_SETS
    ? '- a scene (a moment of people in a place), a feeling, an atmosphere: the place on the map when the line names one the list gives; else a drawn set of a kind of place (a coast at dusk, a city at night), never a named one, with life; or the shot before carried on with a slow push.'
    : '- a scene (a moment of people in a place), a feeling, an atmosphere: the place or the regions on the map when the line names them; else what the line is about by the rows above (a date, a number, someone’s words); never a drawn set (there are none yet).',
].join('\n');

/** How the plan is written. */
const HOW = [
  'How to write the plan:',
  '- Shots in the order of the words. A shot’s "on" is the exact words of the narration it starts on, two to five of them, copied exactly; the first shot starts on the first words.',
  '- A shot lasts while its set stays: inside it, information and camera moves come on their own exact words ("on", and "until" when they leave). A new shot only for a new set; at most eight shots a minute.',
  '- Each shot: one set, up to four information items and two camera moves, life only for what the place really has, and one subject ("focal"): a name of the list, a part of its chart, or "set" for the whole chart or map.',
  '- Names only from the list, written as it writes them (place:…, region:…, number:…); a chart’s own parts as part:<its words>. Never a place, a person, a number, a date or a picture the list does not give.',
  '- Something new every few words, on the words that name it: never more than about eight words of the voice without a new change (a pin, a fill, a label, a mark, a count, a move to what is named). When a shot has nothing more of what the voice is saying to show, cut to a new shot of it: the map on the place or the region it names, a timeline or a calendar for its dates, a quote for someone’s own words. Never hold one picture while the voice talks about something else.',
  '- One change at a time: each information item on its own words, three or four words after the one before; never several on the same words.',
  '- Fill a region on the words that first name it (by its name, as "northern" for the North, or as the side of the map it is on), never later.',
  '- A counter only for a number its own line says, from the list: a number the voice never says is never counted, and a counter comes once, never again.',
  '- "until" only on what lets go (a label, a pin, a mark, a spotlight, a fill as a highlight, a flow, an ask); never on a count, a grow, a draw, a morph, a strike, a stamp or an enter, which stay.',
  '- Words on the stage are for the viewer: a source says where the numbers come from as the claim’s source does, never a claim’s id ("c7"); an event of a timeline is named by what happened, never by its own date; never a field’s name ("label", "number") as words.',
  '- At most eight words on the stage in a shot, one to three to a label. A label names what it is on (a place’s name, a year, a part’s name), always pinned to it (its target); it never repeats what the voice says. Code writes every number from the list.',
  `- ${KIT_GUIDE}`,
  '- join: how the shot hands over to the next: continue for the same set, cut for a new one, dissolve when time passes, zoom-through into a pin or a part, dip after a grave fact.',
  '- Never a card of words standing in for a picture: no word cards, no keyword cards, no names on blank paper. Never a named person drawn (only their portrait or a trace of them), a cartoon or stock figure for a real group (groups are the kit’s silhouettes), the audience or a viewer, a place the list does not give, or a drawn set named after a real place.',
  '- Care: violence is never shown (a death is a pin, a number and a silence); no caricature of anyone.',
].join('\n');

/** Two worked plans: a place shot and a mechanism shot (research §5A and §5B). */
const EXAMPLES = [
  'Two worked examples. Their names are those shows’ own, never yours.',
  [
    'A history show. Its list: place:Lagos [pin], place:Kano [pin], person:Herbert Macaulay [portrait], date:1946. Its line: "In 1946, an eighty-one-year-old engineer set out across Nigeria to fight a new constitution. In Kano, he fell ill."',
    JSON.stringify({
      shots: [
        {
          on: 'In 1946',
          set: { kind: 'map', tilt: 'tilted', terrain: true },
          info: [
            { recipe: 'pin', target: 'place:Lagos', on: 'In 1946' },
            {
              recipe: 'label',
              target: 'place:Lagos',
              text: '1946',
              on: 'In 1946',
            },
          ],
          camera: [{ move: 'establish', on: 'In 1946' }],
          life: ['cloud-shadows'],
          join: 'zoom-through',
          focal: 'place:Lagos',
        },
        {
          on: 'engineer',
          set: { kind: 'portrait', target: 'person:Herbert Macaulay' },
          info: [],
          camera: [{ move: 'push', amount: 'small', on: 'engineer' }],
          life: ['grain'],
          join: 'zoom-through',
          focal: 'person:Herbert Macaulay',
        },
        {
          on: 'set out across',
          set: { kind: 'map', tilt: 'tilted' },
          info: [
            {
              recipe: 'draw',
              target: 'place:Lagos',
              to: 'place:Kano',
              on: 'set out across',
            },
            { recipe: 'pin', target: 'place:Kano', on: 'In Kano' },
            { recipe: 'mark', target: 'place:Kano', on: 'he fell ill' },
          ],
          camera: [
            { move: 'return', on: 'set out across' },
            { move: 'cut-to', target: 'place:Kano', on: 'In Kano' },
          ],
          life: ['cloud-shadows'],
          join: 'cut',
          focal: 'place:Kano',
        },
      ],
    }),
    'Had he no portrait, the second shot would be his trace (his own words as a quote, or his place pinned), never a drawing of him.',
  ].join('\n'),
  [
    'A how-it-works show. Its list: claim:c7 (claim): the compressor squeezes the air before the combustor burns fuel in it. Its lines: "The air is packed tight and hot. What lights it?"',
    JSON.stringify({
      shots: [
        {
          on: 'The air is packed',
          set: {
            kind: 'chart',
            chart: {
              kind: 'flow',
              flow: {
                direction: 'across',
                nodes: [
                  { label: 'Fan', kind: 'start' },
                  { label: 'Compressor', kind: 'step' },
                  { label: 'Combustor', kind: 'step' },
                  { label: 'Turbine', kind: 'step' },
                  { label: 'Nozzle', kind: 'end' },
                ],
                edges: null,
              },
            },
          },
          info: [
            {
              recipe: 'flow',
              target: 'part:Fan',
              to: 'part:Compressor',
              on: 'packed tight and hot',
            },
            {
              recipe: 'spotlight',
              target: 'part:Combustor',
              on: 'What lights it',
            },
            { recipe: 'ask', target: 'part:Combustor', on: 'What lights it' },
          ],
          camera: [
            { move: 'establish', on: 'The air is packed' },
            {
              move: 'push',
              target: 'part:Combustor',
              amount: 'medium',
              on: 'What lights it',
            },
          ],
          life: [],
          join: 'continue',
          focal: 'part:Combustor',
        },
      ],
    }),
  ].join('\n'),
].join('\n\n');

/** The shot board's instructions: the same for every scene, the scene's own in its parts. */
export function shotBoardPrompt(): string {
  return [
    [
      'You are the director of an editorial explainer film: the kind of picture a great documentary channel would make, for every audience.',
      'You plan each scene as shots. You name: each shot’s set, the information that comes on and on which exact words, the camera’s moves, the life in the picture, and how it hands over.',
      'You name only from the closed lists here and from the scene’s list of what may be shown. You never write a coordinate, a time, a size or a colour: code draws, places and times everything you name.',
      'The voice is written and never changes. The picture shows what each line says, one subject at a time, big.',
    ].join(' '),
    `The rules:\n${RULES_PROMPT}`,
    uses(
      'The sets (one a shot):',
      Object.fromEntries(
        SET_KINDS.filter(
          (k) => k !== 'plain' && (DRAWN_SETS || k !== 'set'),
        ).map((k) => [k, SET_USES[k]]),
      ),
    ),
    DRAWN_SETS
      ? `A drawn set’s settings: land ${quoted(SET_LANDS)}; time ${quoted(SET_TIMES)}; weather ${quoted(SET_WEATHERS)}; town ${quoted(SET_TOWNS)}; era (a period in words, never a place).`
      : '',
    `The charts (${CHART_KINDS.length}):\n${CHART_GUIDE}`,
    uses('The information recipes (each on its exact words):', RECIPE_USES),
    uses(
      'The camera’s moves (amount for a push or a pull: "small", "medium" or "large"):',
      MOVE_USES,
    ),
    uses('The joins:', JOIN_USES),
    uses(
      'Life (quiet, never over a label; only what the place really has):',
      LIFE_USES,
    ),
    DECIDE,
    HOW,
    EXAMPLES,
    'Answer with the plan only.',
  ]
    .filter(Boolean)
    .join('\n\n');
}
