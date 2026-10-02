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
 *
 * Real pictures first, and the map only for where (Richard, 2026-10-02,
 * after two films whose maps filled most of their minutes): a person is
 * their photo every time they are the subject; a place is its photo
 * unless the line is about where it is; an event its photo, else the
 * moment drawn; a new picture whenever the voice moves on to a new
 * person, place, thing or event; never the map in anything's stead.
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
  SET_CLIMATES,
  SET_KINDS,
  SET_LANDS,
  SET_PLACE_USES,
  SET_STATES,
  SET_TIMES,
  SET_TOWNS,
  SET_USES,
  SET_WEATHERS,
  type SetKind,
} from '../../business/domain/shots/shot-lists';
import { ICON_NAMES } from '../../business/domain/scene-icon-set';

const quoted = (list: readonly string[]) =>
  list.map((one) => `"${one}"`).join(', ');

/** A closed list with when each is used, a line each. */
const uses = (title: string, table: Record<string, string>) =>
  [title, ...Object.entries(table).map(([k, v]) => `- ${k}: ${v}`)].join('\n');

/**
 * How the board shows how something works on a screen (the UI kit, WP18;
 * after Richard's UI/UX reference): one device that never cuts, a cursor
 * that makes every change, numbered callouts, the camera on the part the
 * voice is on, chapter breaks, a before and an after. A generic UI only.
 */
export const UI_GUIDE = [
  '  - A device and the cursor, on a "screen" set (its desk), for how an app, a site or a tool works, a design looked at closely, a before and an after. A generic UI only: never a real product’s name, logo or look.',
  '  - A device: kit ui.phone, ui.tablet, ui.laptop, ui.browser, ui.window or ui.watch; screen (its kind) or pieces (its own pieces from the top); theme; title, words (the main button’s) and items (labels, commas between): only words the line or the list says, a few each, never a figure; state ("btn-primary: disabled" for a part that starts so).',
  '  - Its parts are named by what they are: screen, content, image, title, badge, rating, price, qty, btn-primary, chip-1, row-1, card-1, stat-1, chart, chart.bar-3, donut, tabs.tab-2, modal, toast, keyboard, and a control by its label’s first word (toggle-dark, slider-volume, input-email, check-remember). Name one as <device id>.<part>.',
  '  - The cursor: kit ui.cursor, one a shot. Its moves, each on its exact words, to a part: move-to; click (state: what the part becomes; a switch flips by itself; a click is the change, no swap with it); drag (a slider; state: its value, 0 to 1); scroll (to: the part to bring into view); type (to: a field; text: the few words typed).',
  '  - Information on a device: callout, a numbered dot on each part the voice counts (code numbers them in order); swap, a part changing on its own (a dialog shown, a button loading); label, mark and spotlight on its parts. The camera pushes into the part the voice is on (target <device>.<part>) and pulls back to the device.',
  '  - A chapter of a walkthrough: join "frost" into its first shot. A before and an after: two devices with the same screen, the first in its old state (state), each labelled ("Before", "After").',
].join('\n');

/**
 * How the board stands the kit's pieces on a set (kit/registry; research
 * §3.5): groups as silhouettes in their side's colour, counted honestly,
 * never a named person, never the audience. Which pieces a scene may use
 * comes with it (shot-board's kit part, for the show's look).
 */
export const KIT_GUIDE = [
  'Actors: pieces of the kit listed with the scene, standing on its set or on the map; at most four a shot, only where the line is about people or things that move in general.',
  '  - Groups of people are silhouettes in their side’s colour (side: a side’s name from the list). A crowd’s count is a number the list or the line gives, or none: never a number of your own.',
  '  - A silhouette never stands for a named person: a named person is their photo (their portrait or another of theirs) or a trace of them. One person or a pair only for an unnamed role the line speaks of (a voter, a worker), never on a line that names someone.',
  '  - Never the audience, a viewer, a student or a host.',
  '  - A vehicle carries what the line says moves (goods, people, an army), of its era.',
  '  - Each actor: id (your name for it), kit, place (a place of the list on the map, a part of the set, or left, centre, right, foreground, background), side, its settings as fields (pose, kind, count, era, who, dress, facing, wagons: only those its kit has), and moves, each on its own exact words, with to (a place, a part, or left, right, off).',
  '  - For example: {"id": "marchers", "kit": "people.crowd", "place": "place:<a place>", "side": "<a side>", "pose": "protest", "count": <the number said>, "moves": [{"move": "enter", "on": "<exact words>"}]}',
  '  - A building (kit building, its kind a field) stands on a drawn set or the map as a kind of building of its era and climate, never a named one: a factory for industry, a hall for a legislature in general.',
  '  - A machine (machine.turbofan, or machine with its kind) is a shot\u2019s subject on a display set: name its parts as actor:<its id>.<part> (actor:engine.combustor) to label, spotlight or push to them; a flow on actor:<its id>.core-flow (text "compress": the air squeezed and heated) or .bypass-flow; run on the machine starts it.',
  '  - An object or a document (kits object and document, their kind a field) is a prop: on a display when the line is about the thing itself, in a drawn set\u2019s scene otherwise. A document shows no words of its own.',
  UI_GUIDE,
].join('\n');

/**
 * How the board stands the illustrated look's characters (WP17; tech §11,
 * after Richard's cartoon world-history reference): groups as era-dressed
 * characters in their side's colour, dressed only as the research's look
 * notes say; a named person by their photo, or as their labelled
 * character only when they have none; a speech bubble and eyes on the
 * map, sparingly. Never violence, never caricature.
 */
export const CHARACTER_GUIDE = [
  'Actors: the kit’s cartoon characters listed with the scene, standing on its set or on the map where their people are; at most four a shot, where the line is about people.',
  '  - A people, an army, a crowd’s front: character.group (two to six, each their own) in their side’s colour (side: a side’s name from the list), dressed and looking as the research’s look notes say (dress: their words, "Roman legionaries, red tunics, banded armour", with their skin or hair only when the notes give it), in their era (era). A count only as the list or the line gives it.',
  '  - One unnamed role the line speaks of (a soldier, a merchant, a monk): character.person with its role. A named person of the list is their photo when the list has one (their portrait, or a photo it says shows them), every time they are the subject; only one with no photo is drawn: character.person with name (the person’s name as the list writes it), drawn from their look notes and labelled with their name the first time.',
  '  - Dress and looks only from the look notes and the topic: never a culture’s dress the research does not name, never a skin or a face taken from a place or a people’s name (with no notes, say none: code gives a varied mix), no religious symbol for a people, no caricature. Weapons only as costume: no one is ever shown hurt.',
  '  - Never the audience, a viewer, a student or a host.',
  '  - A character’s face (expression: neutral, happy, surprised, angry, smug, worried, thinking) and what they hold (prop) only where the line gives a reason; a move may turn the face at a word (move: surprised, angry, happy, worried, neutral).',
  '  - Each actor: id (your name for it), kit, place (a place of the list on the map, a part of the set, or left, centre, right, foreground, background), side, its settings as fields (role, era, dress, name, count, pose, expression, prop, facing: only those its kit has), and moves, each on its own exact words, with to (a place, a part, or left, right, off).',
  '  - For example: {"id": "legion", "kit": "character.group", "place": "place:<a place>", "side": "<a side>", "dress": "<the look notes’ words>", "era": "ancient", "count": 4, "pose": "marching", "moves": [{"move": "walk", "on": "<exact words>", "to": "place:<another>"}]}',
  'Humour, sparingly (an illustrated show only):',
  '  - say: a speech bubble of one to six words from a character on the stage (target: its actor id; text: the words), for a short aside the line invites ("Wait!", "Not again."): at most one in twenty seconds, never the voice’s own words, never a fact.',
  '  - eyes: a region of the map made a character by a pair of eyes (the shot’s "eyes": at a region, to the region or place it glances at, face calm, angry, worried or surprised), for regions eyeing each other; at most two a shot, a few a scene.',
  UI_GUIDE,
].join('\n');

/**
 * The sets as the board is told them where the lists' own words are not
 * enough (Richard, 2026-10-02): the map only for where, photos first.
 */
const SETS_SAID: Partial<Record<SetKind, string>> = {
  map: 'the show’s own map, its regions, seams and places: only where a line is about where something is (locating a place, a border, a route, a region, a journey between places); never a stand-in for what a line is about',
  photo:
    'a photo the list gives, of a person, a place, a thing or an event (the list says what each shows): where its line names what it shows',
  portrait:
    'a real person’s verified portrait: only a person marked [portrait], every time they are the subject',
  set: 'a code-drawn kind of place (a coast at dusk, a city at night, a works on strike, an assembly hall), never a named one: for a feeling or an atmosphere, or the moment of a real event (illustration true)',
};

/** The sets in the order the board reads them: real pictures first, the map last. */
const SETS_ORDER: readonly SetKind[] = [
  'portrait',
  'photo',
  'document',
  'chart',
  'set',
  'screen',
  'map',
  'plain',
];

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

/**
 * The decision table (research §3.2's defaults by row kind), real
 * pictures first and the map only for where (Richard, 2026-10-02): a
 * person by their photo every time they are the subject, a place by its
 * photo unless the line is about where it is, an event by its photo or
 * the moment drawn, a thing by its photo or the kit's; never the map in
 * anything's stead.
 */
const DECIDE = [
  'Choose each line’s shot by what it is about. Each line comes with what the editor wants seen: take its idea, never a place, a person or a picture the list does not give.',
  'Real pictures first: the list’s photos are the film’s best pictures, and the list says what each one shows. Cut to a photo where its line names what it shows.',
  '- a person (who): their photo every time they are the subject: their portrait (marked [portrait]) or a photo the list says shows them; the next time, another of theirs when the list has more than one. With no photo, their own words as a quote; else show what they did, never them. Never their place on the map in their stead.',
  '- a place: its photo when the list has one, for what happens there. The map only when the line is about where it is: locating it, a border, a route, a region, a distance, a journey between places; then travel or cut to the place, pin it (a place marked [pin]) or fill its region; a seam for a border.',
  '- an event (a meeting, a ceremony, a strike, a march, a launch, a vote): its photo; else a drawn scene of the moment: the kit’s silhouettes on a drawn set of its kind of place, with illustration true; else its document or its headline (a document chart).',
  '- a thing (a flag, a ballot, coins, a treaty, a machine): its photo; else the kit’s object or document, big, on a display.',
  '- when: a timeline for several dates, a calendar for one or two, from the dates listed. Never a year’s label on the map, unless the line is about where.',
  '- how many: a counter that counts a number of the list; icons for a count with its whole; bars for three or more numbers.',
  '- why: a flow from the cause to its effect, the wave travelling along it ("flow"); a transfer only where a claim says something moves from one to another.',
  '- a comparison: a split of the two sides.',
  '- exact words: a quote of a quote claim’s words.',
  '- many people (a crowd, workers, voters, migrants): the kit’s silhouettes in their side’s colour on a drawn set (on the map at their place only when the line is about where they are), counted only by a number the list or the line gives.',
  '- what moves people or goods (a train, a ship, a lorry): the kit’s vehicle of its era, travelling across a drawn set; on the map only for a journey between places.',
  '- how something works on a screen (an app, a site, a setting, a design, a sign-in): a "screen" set with a device and the cursor; the cursor clicks, drags and types on the words that say so; callouts number what the voice counts; the camera pushes into the part the voice names; a chapter is a frost join.',
  '- a mood, a feeling, an atmosphere, a scene of people: a photo of what the line is about; else a drawn set of a kind of place with life (a coast at dusk, a city at night), never a named one. Never the map.',
  '- how a machine works: a display set with the kit’s machine as the subject (a jet engine cut open, gears, a pump), its parts labelled one at a time on the words that name them, a flow along its path, the camera pushing to the part the line asks about.',
  '- time passing in a place (night falling, a town waking): the drawn set carried on, its light changing on the words (becomes).',
  'The pace of pictures: a new picture whenever the voice moves on to a new person, place, thing or event, about every five seconds; a picture holds only while the voice stays on what it shows.',
  'The map is never a stand-in: a line that names no place, region, border or route of the list is never on the map, and a map shot ends where its lines stop naming its places.',
].join('\n');

/** The decision table in the illustrated look: its people are the kit's characters. */
const DECIDE_ILLUSTRATED = DECIDE.replace(
  '- an event (a meeting, a ceremony, a strike, a march, a launch, a vote): its photo; else a drawn scene of the moment: the kit’s silhouettes on a drawn set of its kind of place, with illustration true; else its document or its headline (a document chart).',
  '- an event (a meeting, a ceremony, a strike, a march, a launch, a vote): its photo; else a drawn scene of the moment: the kit’s characters dressed for their era on a drawn set of its kind of place, with illustration true; else its document or its headline (a document chart).',
).replace(
  '- many people (a crowd, workers, voters, migrants): the kit’s silhouettes in their side’s colour on a drawn set (on the map at their place only when the line is about where they are), counted only by a number the list or the line gives.',
  '- many people (a people, an army, workers, migrants): the kit’s characters dressed for their era as the look notes say, in their side’s colour, on a drawn set (on the map at their place only when the line is about where they are); a named person by their photo, or as their labelled character only when they have none.',
);

/** How the plan is written: the editorial look's (the illustrated one's, howFor). */
const HOW = [
  'How to write the plan:',
  '- Shots in the order of the words. A shot’s "on" is the exact words of the narration it starts on, two to five of them, copied exactly; the first shot starts on the first words.',
  '- A shot lasts while its set stays: inside it, information and camera moves come on their own exact words ("on", and "until" when they leave). A new shot for a new picture, where the voice moves on to a new person, place, thing or event; at most twelve shots a minute.',
  '- Each shot: one set, up to four information items and two camera moves, life only for what the place really has, and one subject ("focal"): a name of the list, a part of its chart, or "set" for the whole chart or map.',
  '- Names only from the list, written as it writes them (place:…, region:…, number:…); a chart’s own parts as part:<its words>. Never a place, a person, a number, a date or a picture the list does not give.',
  '- Something new every few words, on the words that name it: never more than about eight words of the voice without a new change (a pin, a fill, a label, a mark, a count, a move to what is named). When a shot has nothing more of what the voice is saying to show, cut to a new picture of it: its photo (a person’s, a place’s, a thing’s, an event’s), a count of its number, a quote of someone’s own words, a timeline or a calendar for its dates, the moment drawn; the map only when the voice is on where something is. Never hold one picture while the voice talks about something else.',
  '- One change at a time: each information item on its own words, three or four words after the one before; never several on the same words.',
  '- Fill a region on the words that first name it (by its name, as "northern" for the North, or as the side of the map it is on), never later.',
  '- A counter only for a number its own line says, from the list: a number the voice never says is never counted, and a counter comes once, never again.',
  '- "until" only on what lets go (a label, a pin, a mark, a spotlight, a fill as a highlight, a flow, an ask); never on a count, a grow, a draw, a morph, a strike, a stamp or an enter, which stay.',
  '- Words on the stage are for the viewer: a source says where the numbers come from as the claim’s source does, never a claim’s id ("c7"); an event of a timeline is named by what happened, never by its own date; never a field’s name ("label", "number") as words.',
  '- At most eight words on the stage in a shot, one to three to a label. A label names what it is on (a place’s name, a year, a part’s name), always pinned to it (its target); it never repeats what the voice says. Code writes every number from the list.',
  `- ${KIT_GUIDE}`,
  '- join: how the shot hands over to the next: continue for the same set, cut for a new one, dissolve when time passes, zoom-through into a pin or a part, dip after a grave fact.',
  '- Never a card of words standing in for a picture: no word cards, no keyword cards, no names on blank paper. Never the map standing in for what a line is about. Never a named person drawn (only their photo or a trace of them), a cartoon or stock figure for a real group (groups are the kit’s silhouettes), the audience or a viewer, a place the list does not give, or a drawn set named after a real place.',
  '- Care: violence is never shown (a death is a pin, a number and a silence); no caricature of anyone.',
].join('\n');

/** The editorial rule of people, and the illustrated look's in its place. */
const NEVER_EDITORIAL =
  '- Never a card of words standing in for a picture: no word cards, no keyword cards, no names on blank paper. Never the map standing in for what a line is about. Never a named person drawn (only their photo or a trace of them), a cartoon or stock figure for a real group (groups are the kit’s silhouettes), the audience or a viewer, a place the list does not give, or a drawn set named after a real place.';
const NEVER_ILLUSTRATED =
  '- Never a card of words standing in for a picture: no word cards, no keyword cards, no names on blank paper. Never the map standing in for what a line is about. Never a stock figure: groups are the kit’s characters dressed as their look notes say; a named person by their photo, or as their labelled character only when they have none; never the audience or a viewer, a place the list does not give, or a drawn set named after a real place.';

/** How the plan is written, in the show's look: its kit's guide and its rule of people. */
function howFor(look: 'editorial' | 'illustrated'): string {
  return look === 'illustrated'
    ? HOW.replace(`- ${KIT_GUIDE}`, `- ${CHARACTER_GUIDE}`).replace(
        NEVER_EDITORIAL,
        NEVER_ILLUSTRATED,
      )
    : HOW;
}

/** Two worked plans: a person and a journey, and a mechanism (research §5A and §5B). */
const EXAMPLES = [
  'Two worked examples. Their names are those shows’ own, never yours.',
  [
    'A history show. Its list: place:Lagos [pin], place:Kano [pin], person:Herbert Macaulay [portrait] · more photos of them: photo:Macaulay at a rally 1944, photo:Lagos harbour 1946 (shows place:Lagos), date:1946. Its line: "In 1946, an eighty-one-year-old engineer set out across Nigeria to fight a new constitution. In Kano, he fell ill."',
    JSON.stringify({
      shots: [
        {
          on: 'In 1946, an',
          set: { kind: 'portrait', target: 'person:Herbert Macaulay' },
          info: [],
          camera: [
            {
              move: 'push',
              amount: 'small',
              on: 'eighty-one-year-old engineer',
            },
          ],
          life: ['grain'],
          join: 'cut',
          focal: 'person:Herbert Macaulay',
        },
        {
          on: 'set out across',
          set: { kind: 'map', tilt: 'tilted', terrain: true },
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
            { move: 'establish', on: 'set out across' },
            { move: 'cut-to', target: 'place:Kano', on: 'In Kano' },
          ],
          life: ['cloud-shadows'],
          join: 'cut',
          focal: 'place:Kano',
        },
      ],
    }),
    'He is the subject, so his portrait; were the voice to come back to him, photo:Macaulay at a rally 1944, not the portrait again. The journey between two places is what the map is for. Had he no photo, the first shot would be his own words as a quote, never a drawing of him and never his place on the map. Had the line been "Lagos harbour was crowded in 1946", its shot would be photo:Lagos harbour 1946, not the map: that line is about the port, not about where Lagos is.',
  ].join('\n'),
  [
    'A how-it-works show. Its list: claim:c7 (claim): the compressor squeezes the air before the combustor burns fuel in it. Its lines: "The air is packed tight and hot. What lights it?"',
    JSON.stringify({
      shots: [
        {
          on: 'The air is packed',
          set: { kind: 'set', place: 'display' },
          actors: [
            {
              id: 'engine',
              kit: 'machine.turbofan',
              place: 'centre',
              moves: [],
            },
          ],
          info: [
            { recipe: 'run', target: 'actor:engine', on: 'The air is packed' },
            {
              recipe: 'flow',
              target: 'actor:engine.core-flow',
              text: 'compress',
              on: 'packed tight and hot',
            },
            {
              recipe: 'label',
              target: 'actor:engine.compressor',
              on: 'tight and hot',
            },
            {
              recipe: 'spotlight',
              target: 'actor:engine.combustor',
              on: 'What lights it',
            },
            {
              recipe: 'label',
              target: 'actor:engine.combustor',
              on: 'lights it',
            },
            {
              recipe: 'ask',
              target: 'actor:engine.combustor',
              on: 'What lights it',
            },
          ],
          camera: [
            { move: 'establish', on: 'The air is packed' },
            {
              move: 'push',
              target: 'actor:engine.combustor',
              amount: 'medium',
              on: 'What lights it',
            },
          ],
          life: [],
          join: 'continue',
          focal: 'actor:engine',
        },
      ],
    }),
  ].join('\n'),
].join('\n\n');

/**
 * The shot board's instructions: the same for every scene of a show's
 * look, the scene's own in its parts. An editorial show is never offered
 * a speech bubble or eyes on the map; an illustrated one's people are its
 * characters, not silhouettes.
 */
export function shotBoardPrompt(
  look: 'editorial' | 'illustrated' = 'editorial',
): string {
  const illustrated = look === 'illustrated';
  const recipes = Object.fromEntries(
    Object.entries(RECIPE_USES).filter(([k]) => illustrated || k !== 'say'),
  );
  const life = Object.fromEntries(
    Object.entries(LIFE_USES).filter(([k]) => illustrated || k !== 'eyes'),
  );
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
        SETS_ORDER.filter(
          (k) =>
            SET_KINDS.includes(k) &&
            k !== 'plain' &&
            (DRAWN_SETS || k !== 'set'),
        ).map((k) => [k, SETS_SAID[k] ?? SET_USES[k]]),
      ),
    ),
    [
      `A drawn set’s settings: land ${quoted(SET_LANDS)}; time ${quoted(SET_TIMES)}; weather ${quoted(SET_WEATHERS)}; town ${quoted(SET_TOWNS)}; climate ${quoted(SET_CLIMATES)} or null (never a country); era (a period in words, never a place); place, what stands there:`,
      ...Object.entries(SET_PLACE_USES).map(([k, v]) => `- ${k}: ${v}`),
      `becomes ${quoted(SET_STATES)} or null, with becomesOn its exact words: the light changing while the shot is on (the sun setting, the lights coming on).`,
      'A drawn set is a kind of place, never a named one: no name of a real place, building or event on it, and its words never say it is one. illustration: true only when the set stands for a real event the line tells (a real queue to vote, a real strike), so it carries an "Illustration" tag; null for a mood or a kind of place.',
    ].join('\n'),
    `The charts (${CHART_KINDS.length}):\n${CHART_GUIDE}`,
    uses('The information recipes (each on its exact words):', recipes),
    uses(
      'The camera’s moves (amount for a push or a pull: "small", "medium" or "large"):',
      MOVE_USES,
    ),
    uses('The joins:', JOIN_USES),
    uses(
      'Life (quiet, never over a label; only what the place really has):',
      life,
    ),
    illustrated ? DECIDE_ILLUSTRATED : DECIDE,
    howFor(look),
    EXAMPLES,
    'Answer with the plan only.',
  ]
    .filter(Boolean)
    .join('\n\n');
}
