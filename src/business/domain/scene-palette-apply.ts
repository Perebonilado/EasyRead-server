/**
 * A show's palette put on the things code draws, by name: a counter, a
 * name card or a calendar takes its thing's colour; a chart's bars, a
 * chamber's groups, a split screen's sides and the two ends of a flow
 * take each their own; a group the palette does not name takes a colour
 * the palette has not given, never the one held back for the payoff. The
 * writer's own token stands where the palette names nothing, so one show's
 * North is one colour in every scene, and every look.
 *
 * A map's groups are coloured the same way by the map's own code (its
 * groups carry a token, scene-map), from the same lookup.
 */
import {
  HELD_TOKEN,
  freeTokens,
  paletteLookup,
  type PaletteEntry,
  type PaletteToken,
} from './scene-palette';
import type { SceneThing } from './scene-script';

/** A lookup by name: the token a show's palette gives a thing, or null. */
export type PaletteLookup = (
  name: string | null | undefined,
) => PaletteToken | null;

/** A show's palette as what the mend applies: its lookup, and the colours left for what it does not name. */
export interface ShowPalette {
  lookup: PaletteLookup;
  free: PaletteToken[];
  held: PaletteToken;
}

/** A show's palette, ready to apply: its entries ({thing, token}), and the token it holds back. */
export function showPalette(
  palette: readonly PaletteEntry[],
  held: PaletteToken = HELD_TOKEN,
): ShowPalette {
  return {
    lookup: paletteLookup(palette),
    free: freeTokens(palette, held),
    held,
  };
}

/**
 * A thing with the show's colours on it. Only the kinds that carry a
 * colour change; anything else comes back as it was.
 */
export function applyPalette<T extends SceneThing>(
  thing: T,
  show: ShowPalette,
): T {
  const { lookup } = show;
  let k = 0;
  /** The next colour for a group the palette does not name. */
  const next = (): PaletteToken => show.free[k++ % show.free.length] ?? 'muted';
  /** A group's colour: the palette's, else the writer's own, else the next free one. */
  const groupColour = (name: string, own: PaletteToken | null) =>
    lookup(name) ?? own ?? next();
  switch (thing.kind) {
    case 'counter':
      return {
        ...thing,
        counter: {
          ...thing.counter,
          colour:
            lookup(thing.name) ??
            lookup(thing.counter.label) ??
            thing.counter.colour,
        },
      };
    case 'icons':
      return {
        ...thing,
        icons: {
          ...thing.icons,
          colour:
            lookup(thing.icons.unit) ??
            lookup(thing.name) ??
            lookup(thing.icons.label) ??
            thing.icons.colour,
        },
      };
    case 'namecard':
      return {
        ...thing,
        namecard: {
          ...thing.namecard,
          colour: lookup(thing.namecard.name) ?? thing.namecard.colour,
        },
      };
    case 'calendar':
      return {
        ...thing,
        calendar: {
          ...thing.calendar,
          colour:
            lookup(thing.name) ??
            thing.calendar.calendars
              .map((c) => lookup(c.label))
              .find(Boolean) ??
            thing.calendar.colour,
        },
      };
    case 'strike':
      return {
        ...thing,
        strike: {
          ...thing.strike,
          colour: lookup(thing.name) ?? thing.strike.colour,
        },
      };
    case 'document':
      return {
        ...thing,
        document: {
          ...thing.document,
          colour: lookup(thing.document.title) ?? thing.document.colour,
        },
      };
    case 'seats':
      return {
        ...thing,
        seats: {
          ...thing.seats,
          groups: thing.seats.groups.map((g) => ({
            ...g,
            colour: groupColour(g.name, g.colour),
          })),
        },
      };
    case 'split': {
      const [a, b] = thing.split.sides;
      return {
        ...thing,
        split: {
          ...thing.split,
          sides: [
            { ...a, colour: groupColour(a.label, a.colour) },
            { ...b, colour: groupColour(b.label, b.colour) },
          ],
        },
      };
    }
    case 'transfer':
      return {
        ...thing,
        transfer: {
          ...thing.transfer,
          from: {
            ...thing.transfer.from,
            colour: groupColour(
              thing.transfer.from.label,
              thing.transfer.from.colour,
            ),
          },
          to: {
            ...thing.transfer.to,
            colour: groupColour(
              thing.transfer.to.label,
              thing.transfer.to.colour,
            ),
          },
          colour:
            lookup(thing.transfer.label) ??
            lookup(thing.name) ??
            thing.transfer.colour,
        },
      };
    case 'chart':
      return {
        ...thing,
        chart: {
          ...thing.chart,
          bars: thing.chart.bars.map((bar) => ({
            ...bar,
            colour: groupColour(bar.label, bar.colour ?? null),
          })),
        },
      };
    default:
      return thing;
  }
}
