/**
 * Types for the upstream main-thread proxy, mirroring
 * `valhalla/src/bindings/wasm/index.d.ts` on the `wasm-bindings` branch.
 *
 * The implementation is NOT copied here: `public/valhalla-wasm/index.mjs` is loaded by dynamic
 * import at runtime. The postMessage protocol behind it changes upstream (worker-failure
 * handling, cancellation), while this API surface is stable - so only the surface is duplicated.
 * Keeping the implementation out of `src/` also keeps `tsc --noEmit` working on a clean clone
 * where the gitignored artifacts have not been synced.
 */

export interface ValhallaActorOptions {
  /** URL of worker.js, resolved by the page. */
  workerUrl: string;
  /** Valhalla config. `mjolnir.tile_url` (a tar, or a `{tilePath}` URL) and `mjolnir.tile_url_gz` pick the remote tile layout. */
  config: Record<string, unknown>;
  /** Mount point for an IDBFS tile cache. `null` keeps tiles in memory only. */
  cacheDir?: string | null;
}

/** Every action takes a JSON request string and resolves to a JSON response string. */
export interface ValhallaActor {
  route(request: string): Promise<string>;
  isochrone(request: string): Promise<string>;
  optimizedRoute(request: string): Promise<string>;
  height(request: string): Promise<string>;
  status(request: string): Promise<string>;
  terminate(): void;
}

export interface UpstreamValhallaModule {
  Valhalla: {
    create(options: ValhallaActorOptions): Promise<ValhallaActor>;
  };
}
