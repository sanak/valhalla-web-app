import { getTarUrl } from '@/utils/routing-engine';
import type { UpstreamValhallaModule, ValhallaActor } from './upstream-types';

const ASSET_BASE = `${import.meta.env.BASE_URL}valhalla-wasm/`;

/** IDBFS mount point, and therefore also the IndexedDB database name Emscripten creates. */
const CACHE_DIR = '/valhalla-cache';

let actorPromise: Promise<ValhallaActor> | null = null;
let bootedTarUrl: string | null = null;

async function loadConfig(tarUrl: string): Promise<Record<string, unknown>> {
  const configResponse = await fetch(`${ASSET_BASE}valhalla.json`);
  if (!configResponse.ok) {
    throw new Error(
      'Valhalla wasm artifacts are missing. Run `npm run wasm:sync` to copy them from the valhalla repository.'
    );
  }
  const config = (await configResponse.json()) as {
    mjolnir: Record<string, unknown>;
  };
  // worker.js decides tile_dir itself from cacheDir, so only the tar location is injected here
  config.mjolnir.tile_url = tarUrl;
  return config;
}

async function boot(tarUrl: string): Promise<ValhallaActor> {
  if (tarUrl.trim() === '') {
    throw new Error(
      'No tileset tar URL is configured. Set one under Routing Engine in the settings panel, or provide VITE_VALHALLA_TAR_URL at build time.'
    );
  }
  const config = await loadConfig(tarUrl);
  // @vite-ignore keeps Vite out of the emscripten glue: worker.js imports valhalla.mjs
  // relatively and valhalla.mjs loads valhalla.wasm next to itself
  const upstream = (await import(
    /* @vite-ignore */ `${ASSET_BASE}index.mjs`
  )) as UpstreamValhallaModule;

  return upstream.Valhalla.create({
    workerUrl: `${ASSET_BASE}worker.js`,
    config,
    cacheDir: CACHE_DIR,
  });
}

export function getActor(): Promise<ValhallaActor> {
  const tarUrl = getTarUrl();
  if (actorPromise && bootedTarUrl === tarUrl) {
    return actorPromise;
  }

  resetActor();
  bootedTarUrl = tarUrl;
  const pending: Promise<ValhallaActor> = boot(tarUrl).catch(
    (error: unknown) => {
      // a failed boot must not stay cached, or every later call replays the same failure - but
      // only clear state if this attempt is still the current one, or a stale rejection from a
      // superseded boot would clobber (and orphan) a newer, live actor
      if (actorPromise === pending) {
        actorPromise = null;
        bootedTarUrl = null;
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
  bootedTarUrl = null;
  void runningActor?.then((actor) => actor.terminate()).catch(() => undefined);
}

export async function clearTileCache(): Promise<void> {
  resetActor();
  await new Promise<void>((resolve, reject) => {
    const deletion = indexedDB.deleteDatabase(CACHE_DIR);
    deletion.onsuccess = () => resolve();
    deletion.onerror = () =>
      reject(new Error('Could not clear the tile cache'));
    // a still-open connection blocks the delete; the next boot repopulates from whatever
    // survived, so this is not worth failing over
    deletion.onblocked = () => resolve();
  });
}
