import { getTileSource, type TileSource } from '@/utils/routing-engine';
import type { UpstreamValhallaModule, ValhallaActor } from './upstream-types';

const ASSET_BASE = `${import.meta.env.BASE_URL}valhalla-wasm/`;

/**
 * Prefix of the IDBFS mount points, which double as the IndexedDB database names Emscripten
 * creates. Each tile source gets its own: valhalla pins a cache directory to the tile_url it was
 * first filled from (a different one fails the boot with "Tile URL changed"), and gzipped tiles
 * are cached as .gph.gz where plain ones are .gph.
 */
const CACHE_DIR_PREFIX = '/valhalla-cache';

let actorPromise: Promise<ValhallaActor> | null = null;
let bootedSourceKey: string | null = null;

function toSourceKey(tileSource: TileSource): string {
  return JSON.stringify([tileSource.url, tileSource.gzipped]);
}

/** FNV-1a: only has to keep IndexedDB names short and distinct, not be secure. */
function hashSourceKey(sourceKey: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < sourceKey.length; index++) {
    hash ^= sourceKey.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function getCacheDir(tileSource: TileSource): string {
  return `${CACHE_DIR_PREFIX}-${hashSourceKey(toSourceKey(tileSource))}`;
}

async function loadConfig(
  tileSource: TileSource
): Promise<Record<string, unknown>> {
  const configResponse = await fetch(`${ASSET_BASE}valhalla.json`);
  if (!configResponse.ok) {
    throw new Error(
      'Valhalla wasm artifacts are missing. Run `npm run wasm:sync` to copy them from the valhalla repository.'
    );
  }
  const config = (await configResponse.json()) as {
    mjolnir: Record<string, unknown>;
  };
  // worker.js decides tile_dir itself from cacheDir, so only the tile location is injected here;
  // valhalla infers tar vs per-tile from the {tilePath} marker in the URL
  config.mjolnir.tile_url = tileSource.url;
  config.mjolnir.tile_url_gz = tileSource.gzipped;
  return config;
}

async function boot(tileSource: TileSource): Promise<ValhallaActor> {
  if (tileSource.url.trim() === '') {
    throw new Error(
      'No tileset URL is configured. Set one under Routing Engine in the settings panel, or provide VITE_VALHALLA_TILE_URL at build time.'
    );
  }
  const config = await loadConfig(tileSource);
  // @vite-ignore keeps Vite out of the emscripten glue: worker.js imports valhalla.mjs
  // relatively and valhalla.mjs loads valhalla.wasm next to itself
  const upstream = (await import(
    /* @vite-ignore */ `${ASSET_BASE}index.mjs`
  )) as UpstreamValhallaModule;

  return upstream.Valhalla.create({
    workerUrl: `${ASSET_BASE}worker.js`,
    config,
    cacheDir: getCacheDir(tileSource),
  });
}

export function getActor(): Promise<ValhallaActor> {
  const tileSource = getTileSource();
  const sourceKey = toSourceKey(tileSource);
  if (actorPromise && bootedSourceKey === sourceKey) {
    return actorPromise;
  }

  resetActor();
  bootedSourceKey = sourceKey;
  const pending: Promise<ValhallaActor> = boot(tileSource).catch(
    (error: unknown) => {
      // a failed boot must not stay cached, or every later call replays the same failure - but
      // only clear state if this attempt is still the current one, or a stale rejection from a
      // superseded boot would clobber (and orphan) a newer, live actor
      if (actorPromise === pending) {
        actorPromise = null;
        bootedSourceKey = null;
      }
      throw error;
    }
  );
  actorPromise = pending;
  return actorPromise;
}

export function resetActor(): void {
  const runningActor = actorPromise;
  actorPromise = null;
  bootedSourceKey = null;
  void runningActor?.then((actor) => actor.terminate()).catch(() => undefined);
}

function deleteDatabase(databaseName: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const deletion = indexedDB.deleteDatabase(databaseName);
    deletion.onsuccess = () => resolve();
    deletion.onerror = () =>
      reject(new Error('Could not clear the tile cache'));
    // a still-open connection blocks the delete; the next boot repopulates from whatever
    // survived, so this is not worth failing over
    deletion.onblocked = () => resolve();
  });
}

/** Clears every tile source's cache, not just the active one, so stale sources don't pile up. */
export async function clearTileCache(): Promise<void> {
  resetActor();
  // indexedDB.databases() is missing from older browsers; the active cache is the one that matters
  const cacheNames =
    typeof indexedDB.databases === 'function'
      ? (await indexedDB.databases())
          .map((database) => database.name)
          .filter((name): name is string =>
            Boolean(name?.startsWith(CACHE_DIR_PREFIX))
          )
      : [getCacheDir(getTileSource())];
  await Promise.all(cacheNames.map(deleteDatabase));
}
