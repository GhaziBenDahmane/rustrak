import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/components/shadcn/badge';
import { Button } from '@/shared/ui/components/shadcn/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/shared/ui/components/shadcn/collapsible';

interface IntegrationSectionProps {
  icon: ReactNode;
  /** The icon swatch, e.g. `bg-orange-500/10 text-orange-500`. */
  iconClassName: string;
  title: string;
  description: string;
  /** The "N configured" badge, absent while nothing is. */
  badge?: string;
  children: ReactNode;
}

/** One kind of integration on the integrations page: a header over its tiles. */
export function IntegrationSection({
  icon,
  iconClassName,
  title,
  description,
  badge,
  children,
}: IntegrationSectionProps) {
  return (
    <Collapsible defaultOpen className="group/section">
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3.5 transition-colors hover:bg-accent/50 group-data-open/section:rounded-b-none group-data-open/section:border-b-0">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex size-8 items-center justify-center rounded-md',
                iconClassName,
              )}
            >
              {icon}
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold leading-none">{title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {badge && (
              <Badge
                variant="secondary"
                className="text-[10px] font-bold uppercase tracking-wider"
              >
                {badge}
              </Badge>
            )}
            <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-data-open/section:rotate-180" />
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="rounded-b-lg border border-t-0 bg-card/50 p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface IntegrationTileProps {
  icon: ReactNode;
  /** The provider's brand swatch, e.g. `bg-[#4A154B]`. */
  color: string;
  name: string;
  description: string;
  status: string;
  /** Green badge. */
  connected: boolean;
  /** Faded badge: configured but switched off. */
  disabled?: boolean;
  /** Faded tile: nothing configured yet. */
  empty: boolean;
  action: string;
  ariaLabel: string;
  onOpen: () => void;
}

/** One provider tile: its mark, its state, and the way into its dialog. */
export function IntegrationTile({
  icon,
  color,
  name,
  description,
  status,
  connected,
  disabled = false,
  empty,
  action,
  ariaLabel,
  onOpen,
}: IntegrationTileProps) {
  return (
    /* Not a <button>: the card holds its own button, and a button inside a
       button is invalid HTML. So it takes the role and the keyboard handling
       a button would have given it for free — without this the card was
       mouse-only and unreachable by Tab. */
    // biome-ignore lint/a11y/useSemanticElements: see above
    <div
      className={cn(
        'group relative bg-card border rounded-lg p-5 flex flex-col justify-between h-48',
        'hover:border-primary/50 transition-all cursor-pointer',
        empty && 'opacity-70 hover:opacity-100',
      )}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onOpen();
      }}
    >
      <div className="flex justify-between items-start">
        <div
          className={cn(
            'size-10 rounded flex items-center justify-center text-white',
            color,
          )}
        >
          {icon}
        </div>

        <Badge
          variant={connected ? 'default' : 'secondary'}
          className={cn(
            'text-[10px] font-bold uppercase tracking-wider',
            connected &&
              'bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20',
            disabled && 'opacity-60',
          )}
        >
          {status}
        </Badge>
      </div>

      <div>
        <h3 className="font-bold text-base">{name}</h3>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
          {description}
        </p>
      </div>

      <Button
        variant="outline"
        className="w-full text-xs font-bold uppercase tracking-wide"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
      >
        {action}
      </Button>
    </div>
  );
}
