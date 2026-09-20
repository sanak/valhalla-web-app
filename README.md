# Valhalla Demo App

<img width="2253" height="1303" alt="image" src="https://github.com/user-attachments/assets/00f43ea8-51df-4319-ad31-4feadf0024c1" />

This is the ReactJS demo web app running on https://valhalla.openstreetmap.de. It provides routing and isochrones with a magnitude of options and makes requests to [Valhalla](https://github.com/valhalla/valhalla), an open source routing engine and accompanying libraries for use with OpenStreetMap data.

## Commands

### `npm install`

Install the dependencies.

### `npm run start`

Runs the app in hot-reload mode on [http://localhost:3000](http://localhost:3000) to view changes in the browser.

### `npm run build`

Builds and bundles the minified app for production to the `./build` folder.

Your app is ready to be deployed!

## Testing

[![Tests and Linting](https://github.com/valhalla/web-app/actions/workflows/playwright.yml/badge.svg)](https://github.com/valhalla/web-app/actions/workflows/playwright.yml)

This project includes end-to-end tests using [Playwright](https://playwright.dev/) to ensure the application works correctly across different scenarios.

### Unit Tests

```bash
npm test
```

### End-to-End Tests

First install the browser(s) you want to use:

```bash
# Install all browsers
npx playwright install

# Or install only what you need
npx playwright install chromium
npx playwright install firefox
```

```bash
# Run all e2e tests (both chromium and firefox)
npm run test:e2e

# Run tests for a specific browser
npm run test:e2e -- --project=chromium
npm run test:e2e -- --project=firefox

# Run tests with visible browser (useful for debugging)
npm run test:e2e:headed -- --project=firefox

# Open Playwright Test UI for interactive testing
npm run test:e2e:ui
```

Tests automatically start the development server if it's not already running.

## Get started with Docker

```bash
git clone https://github.com/nilsnolde/valhalla-app.git
cd valhalla-app
docker compose up --build
```

## Customization

Edit `.env` to manage

- Nominatim API server
- Valhalla API server
- Tile server
- Map start location

## WebAssembly routing

Besides talking to a remote Valhalla server, this app can run routing entirely in the browser via
the [Valhalla wasm bindings](https://github.com/valhalla/valhalla), reading tiles over HTTP from
a tar or a directory of tiles hosted anywhere. This is useful for small, self-contained deployments (a single
region's tileset) that need no routing backend at all.

### 1. Build the bindings

In a checkout of the [valhalla](https://github.com/valhalla/valhalla) repo:

```bash
cd src/bindings/wasm
./scripts/build_deps.sh
./scripts/build.sh
```

### 2. Sync the artifacts into this app

```bash
npm run wasm:sync
```

This copies `valhalla.mjs`, `valhalla.wasm`, `worker.js`, `index.mjs`, and a `valhalla.json`
config into `public/valhalla-wasm/` (gitignored — each machine syncs its own copy). By default it
looks for a `valhalla` checkout next to this repo; point elsewhere with
`VALHALLA_REPO=/path/to/valhalla npm run wasm:sync`.

### 3. Configure the app

Set in `.env`:

```
VITE_ROUTING_MODE=wasm
VITE_VALHALLA_TILE_URL=https://tiles.example.com/tiles.tar
VITE_VALHALLA_TILE_URL_GZ=false
```

(All of them can also be changed at runtime from the "Routing Engine" section of the settings
panel, without a rebuild.)

### Tile layouts

`VITE_VALHALLA_TILE_URL` and `VITE_VALHALLA_TILE_URL_GZ` are passed straight through as valhalla's
`mjolnir.tile_url` and `mjolnir.tile_url_gz`. A URL containing `{tilePath}` addresses one file per
tile; anything else is a tar.

| Layout                                | Built with                                      | Tile URL             | GZ      |
| ------------------------------------- | ----------------------------------------------- | -------------------- | ------- |
| tar                                   | `valhalla_build_extract`                        | `…/tiles.tar`        | `false` |
| tar of gzipped tiles                  | `valhalla_build_extract --gzip`                 | `…/tiles.tar`        | `true`  |
| one `.gph` per tile + `index.bin`     | a tile dir, plus `index.bin` taken from a tar   | `…/tiles/{tilePath}` | `false` |
| gzipped `.gph` per tile + `index.bin` | `gzip -9 -n` each tile, keeping the `.gph` name | `…/tiles/{tilePath}` | `true`  |

- The `{tilePath}` marker is what selects the per-tile layout: a URL without it is read as a tar,
  so pointing at a tile directory fails with `The first file's tar header is not valid`.
- A tar is read with HTTP Range requests, not downloaded whole, so its host must send
  `Accept-Ranges: bytes`, allow the `Range` request header via CORS, and set
  `Access-Control-Expose-Headers: Content-Range`.
- Per-tile layouts need `index.bin` next to the tiles. Without it valhalla turns
  `loki.use_connectivity` off, so the map loses the tileset's coverage outline.
- Serve `index.bin` uncompressed, and never set `Content-Encoding: gzip` on tiles or on the tar:
  the browser would inflate them before valhalla does. A gzipped tar or gzipped tiles are already
  compressed at rest, which is what makes them roughly 2.5× smaller.

### Notes

- The first request downloads roughly 6.4MB of wasm/glue code before any routing happens.
- Routing blocks on synchronous tile requests, so a small regional tileset behind a CDN is the
  intended shape — not a planet-scale tileset.
- Fetched tiles are cached in the browser's IndexedDB (IDBFS), one database per tile URL and GZ
  setting, and survive reloads; use "Clear tile cache" in the Routing Engine settings section to
  remove them all.
