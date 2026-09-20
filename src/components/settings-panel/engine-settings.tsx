import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Cpu, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { COVERAGE_QUERY_KEY } from '@/hooks/use-coverage-query';
import { clearTileCache, resetActor } from '@/lib/valhalla-wasm/actor';
import {
  getRoutingMode,
  getTileSource,
  setRoutingMode,
  setTileSource,
  validateTileUrl,
  type RoutingMode,
  type TileSource,
} from '@/utils/routing-engine';

interface EngineSettingsProps {
  /** Notified after the mode is persisted, so a parent holding its own copy can stay in sync. */
  onModeChange?: (mode: RoutingMode) => void;
}

export const EngineSettings = ({ onModeChange }: EngineSettingsProps = {}) => {
  const queryClient = useQueryClient();
  const [routingMode, setRoutingModeState] = useState<RoutingMode>(() =>
    getRoutingMode()
  );
  const [tileUrl, setTileUrlState] = useState<string>(
    () => getTileSource().url
  );
  const [tileUrlGzipped, setTileUrlGzipped] = useState<boolean>(
    () => getTileSource().gzipped
  );
  const [tileUrlError, setTileUrlError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  /** A booted worker answers from the old config, so it has to go whenever the config moves. */
  const rebootBackend = () => {
    resetActor();
    // The coverage overlay is cached with staleTime/gcTime Infinity and is only meaningful for
    // the tileset that is loaded right now, so it is reset rather than invalidated: a disabled
    // query keeps serving its cached value, and invalidating one does not even notify its
    // observers. Resetting is what actually makes the map drop the outline.
    void queryClient.resetQueries({ queryKey: [COVERAGE_QUERY_KEY] });
    void queryClient.invalidateQueries();
  };

  const handleModeChange = (nextMode: string) => {
    // ToggleGroup emits '' when the active item is clicked again; keep the current mode
    if (nextMode !== 'server' && nextMode !== 'wasm') {
      return;
    }
    setRoutingModeState(nextMode);
    setRoutingMode(nextMode);
    rebootBackend();
    onModeChange?.(nextMode);
  };

  /** Stores whatever `setTileSource` ended up keeping, then reboots onto the new config. */
  const applyTileSource = (tileSource: TileSource) => {
    setTileUrlError(null);
    setTileSource(tileSource);
    // setTileSource trims, and removes the localStorage key entirely for an empty or default
    // source - re-read it so the controls reflect what actually got stored.
    const storedSource = getTileSource();
    setTileUrlState(storedSource.url);
    setTileUrlGzipped(storedSource.gzipped);
    rebootBackend();
  };

  const handleTileUrlBlur = () => {
    if (tileUrl.trim() === getTileSource().url) {
      setTileUrlError(null);
      return;
    }
    // an emptied field means "back to the env default" - validation would only reject it as
    // empty and latch an error the user has no other way to clear
    if (tileUrl.trim() === '') {
      applyTileSource({ url: '', gzipped: tileUrlGzipped });
      return;
    }
    const validation = validateTileUrl(tileUrl);
    if (!validation.valid) {
      setTileUrlError(validation.error ?? 'Invalid URL');
      return;
    }
    applyTileSource({ url: tileUrl, gzipped: tileUrlGzipped });
  };

  /** Pairs the flag with the stored URL, not a half-typed or invalid one still in the field. */
  const handleGzippedChange = (gzipped: boolean) => {
    applyTileSource({ url: getTileSource().url, gzipped });
  };

  const handleClearCache = async () => {
    try {
      await clearTileCache();
      void queryClient.invalidateQueries();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not clear the tile cache'
      );
    }
  };

  return (
    <CollapsibleSection
      title="Routing Engine"
      icon={Cpu}
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <div className="space-y-3">
        <Field>
          <FieldLabel htmlFor="routing-mode-toggle">Backend</FieldLabel>
          <FieldDescription>
            Where routing runs: on the remote Valhalla server, or in this
            browser.
          </FieldDescription>
          <ToggleGroup
            id="routing-mode-toggle"
            type="single"
            value={routingMode}
            onValueChange={handleModeChange}
            className="w-full"
          >
            <ToggleGroupItem value="server" className="flex-1">
              Remote server
            </ToggleGroupItem>
            <ToggleGroupItem value="wasm" className="flex-1">
              Browser (WebAssembly)
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>

        {routingMode === 'wasm' && (
          <>
            <Field data-invalid={!!tileUrlError}>
              <FieldLabel htmlFor="tile-url-input">Tile URL</FieldLabel>
              <FieldDescription>
                One file per tile, as a URL ending in the literal{' '}
                <code>{'{tilePath}'}</code> — e.g.{' '}
                <code className="break-all">
                  https://tiles.example.com/tiles/{'{tilePath}'}
                </code>
                . Serve <code>index.bin</code> next to the tiles, or the
                coverage outline is lost.
              </FieldDescription>
              <FieldDescription>
                Any other URL is read as a tileset tar by range request, so the
                host must send <code>Accept-Ranges: bytes</code>, allow the{' '}
                <code>Range</code> request header via CORS, and expose{' '}
                <code>Content-Range</code>.
              </FieldDescription>
              <Input
                id="tile-url-input"
                type="url"
                placeholder="https://tiles.example.com/tiles.tar"
                value={tileUrl}
                onChange={(event) => {
                  setTileUrlState(event.target.value);
                  setTileUrlError(null);
                }}
                onBlur={handleTileUrlBlur}
                aria-invalid={!!tileUrlError}
              />
              <FieldError>{tileUrlError}</FieldError>
            </Field>
            <Field orientation="horizontal">
              <Switch
                id="tile-url-gz-switch"
                checked={tileUrlGzipped}
                onCheckedChange={handleGzippedChange}
              />
              <FieldLabel htmlFor="tile-url-gz-switch">
                Gzipped tiles
              </FieldLabel>
            </Field>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearCache}
              className="w-full"
            >
              <Trash2 className="size-3.5" />
              Clear tile cache
            </Button>
          </>
        )}
      </div>
    </CollapsibleSection>
  );
};
