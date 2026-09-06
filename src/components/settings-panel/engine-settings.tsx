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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { clearTileCache, resetActor } from '@/lib/valhalla-wasm/actor';
import {
  getRoutingMode,
  getTarUrl,
  setRoutingMode,
  setTarUrl,
  validateTarUrl,
  type RoutingMode,
} from '@/utils/routing-engine';

export const EngineSettings = () => {
  const queryClient = useQueryClient();
  const [routingMode, setRoutingModeState] = useState<RoutingMode>(() =>
    getRoutingMode()
  );
  const [tarUrl, setTarUrlState] = useState<string>(() => getTarUrl());
  const [tarUrlError, setTarUrlError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  /** A booted worker answers from the old config, so it has to go whenever the config moves. */
  const rebootBackend = () => {
    resetActor();
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
  };

  const handleTarUrlBlur = () => {
    if (tarUrl.trim() === getTarUrl()) {
      setTarUrlError(null);
      return;
    }
    const validation = validateTarUrl(tarUrl);
    if (!validation.valid) {
      setTarUrlError(validation.error ?? 'Invalid URL');
      return;
    }
    setTarUrlError(null);
    setTarUrl(tarUrl);
    // setTarUrl trims, and removes the localStorage key entirely for an empty or default
    // value - re-read it so the field reflects what actually got stored.
    setTarUrlState(getTarUrl());
    rebootBackend();
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
            <Field data-invalid={!!tarUrlError}>
              <FieldLabel htmlFor="tar-url-input">Tar URL</FieldLabel>
              <FieldDescription>
                Tileset tar read by range request. The host must send{' '}
                <code>Accept-Ranges: bytes</code>, allow the <code>Range</code>{' '}
                request header via CORS, and expose <code>Content-Range</code>.
              </FieldDescription>
              <Input
                id="tar-url-input"
                type="url"
                placeholder="https://tiles.example.com/tiles.tar"
                value={tarUrl}
                onChange={(event) => {
                  setTarUrlState(event.target.value);
                  setTarUrlError(null);
                }}
                onBlur={handleTarUrlBlur}
                aria-invalid={!!tarUrlError}
              />
              <FieldError>{tarUrlError}</FieldError>
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
