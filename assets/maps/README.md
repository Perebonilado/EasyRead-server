# Map data

The maps the stage draws by code (`src/business/domain/scene-map.ts`) are drawn from
[Natural Earth](https://www.naturalearthdata.com/) data. Natural Earth is in the
**public domain** ([terms of use](https://www.naturalearthdata.com/about/terms-of-use/)):
no permission is needed to use, change or share it, and no credit is required (we give it anyway).

Countries' coastlines and borders come from the `world-atlas` npm package
(Natural Earth 4.1.0 admin-0, as TopoJSON). Everything in this folder was made from
Natural Earth's own GeoJSON in its official repository,
[nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector) (`geojson/`).
The source files are not kept here; each script says how to fetch them.

| File | What it holds | Natural Earth source | Made by |
|---|---|---|---|
| `places.json` | about 1,250 capitals and great cities: names, other names, country, coordinates, kind, population | `ne_50m_populated_places_simple` | `scripts/map-data.ts` |
| `rivers.json` | named rivers and lake centrelines, as lines | `ne_50m_rivers_lake_centerlines` | `scripts/map-data.ts` |
| `lakes.json` | lakes and reservoirs, as polygons | `ne_50m_lakes` | `scripts/map-data.ts` |
| `admin1.json` | 4,580 states, provinces and regions inside 241 countries, as one TopoJSON (3.9 MB) | `ne_10m_admin_1_states_provinces`, release v5.1.2 | `scripts/map-admin1.ts` |

## `admin1.json`

One TopoJSON object, `units`: a geometry per area, sharing borders as arcs, so areas can be
merged into one shape (a named region: "the Northern Region" is these states) and the border
two regions share can be drawn as a line of its own. Outlines are simplified to about a kilometre
with [mapshaper](https://github.com/mbloch/mapshaper) (`interval=1000`, every shape kept) and
quantized to about 400 metres. Each geometry keeps only:

| Field | |
|---|---|
| `k` | its key: its ISO 3166-2 code (`NG-KN`), or one made from its country's where it has none or shares one |
| `n` | its name as a map writes it: the English one where the local one is another language's (Bayern: Bavaria) |
| `a` | its other names, Latin script only, `\|` between: the local name, the name with its kind ("Kano State"), old names ("Orissa") |
| `c` | its country, as world-atlas names it |
| `t` | what kind of area it is ("State", "Province", "Region") |
| `r` | the larger region Natural Earth puts it in, where it gives one (a United States census region, a French région, an Italian regione) |
| `p` | the part of its country it is in, where the country is made of parts (Scotland, Wales, Zanzibar, Flanders) |

Areas in territories world-atlas does not draw (Gibraltar, the sovereign base areas on Cyprus,
the United States Minor Outlying Islands, Tuvalu, the Coral Sea Islands, the Spratly Islands,
Clipperton Island, Guantanamo Bay) are left out.

To make it again:

```sh
curl -L -o ne_10m_admin_1_states_provinces.geojson \
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson
npx ts-node --transpile-only scripts/map-admin1.ts ne_10m_admin_1_states_provinces.geojson
```

The script runs mapshaper 0.7.72 through `npx` (no dependency of the app).

## Borders and time

Natural Earth draws **today's** borders. A map of a past year says so in a small note
("Today's borders") unless research says that year's borders were the same
(`MapDraft.bordersDiffer: false`); historical regions are drawn approximately, as groups of
today's areas.
