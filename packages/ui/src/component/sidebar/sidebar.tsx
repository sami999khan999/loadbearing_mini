import { cn } from "../../class-name/index.js";
import { BaseDialog, type ReactNode, useEffect, useSyncExternalStore } from "../../import.js";
import { usePortalContainer } from "../../theme/index.js";
import { buttonClassName } from "../button/index.js";
import { Icon } from "../icon/index.js";
import { ScrollArea } from "../scroll-area/index.js";

export interface SidebarProps {
  // The region's accessible name. A page with a sidebar and a header nav has two
  // landmarks, and an unnamed one tells a screen reader nothing about which is which.
  readonly label: string;
  readonly header?: ReactNode;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
  // Narrow screens only: on a wide one the sidebar is always in the layout. The button
  // that opens it lives in the page, which is why this is controlled.
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  // The drawer's close button. A phone screen reader has no Escape key.
  readonly closeLabel: string;
  readonly className?: string;
}

// Tailwind's `lg`, the width the `max-lg:` classes below switch at.
const WIDE = "(min-width: 64rem)";

function subscribe(onChange: () => void): () => void {
  const query = globalThis.matchMedia?.(WIDE);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

// The server and a DOM without `matchMedia` render the column; `max-lg:hidden` keeps it
// off a narrow screen until hydration swaps it for the drawer.
function useWide(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => globalThis.matchMedia?.(WIDE).matches ?? true,
    () => true,
  );
}

// A column that stays put while the page scrolls, and below 64rem a modal drawer: the
// width at which a sidebar, an article and an outline stop fitting side by side.
export function Sidebar({
  label,
  header,
  footer,
  children,
  open = false,
  onOpenChange,
  closeLabel,
  className,
}: SidebarProps) {
  const wide = useWide();
  const container = usePortalContainer();

  // Widening shows the column and ignores `open`, so a drawer left open would pop back,
  // modal and holding focus, the next time the screen narrowed. Widening closes it.
  useEffect(() => {
    if (wide && open) onOpenChange?.(false);
  }, [wide, open, onOpenChange]);

  const body = (
    <>
      {header ? (
        <div className="ui-sidebar__header flex flex-col gap-3 px-4 pt-4 pb-2">{header}</div>
      ) : null}
      {
        // The only part that scrolls, so the search field and the footer never leave the screen.
      }
      <ScrollArea
        className="ui-sidebar__body min-h-0 flex-1"
        contentClassName="overscroll-contain px-4 pt-2 pb-4"
      >
        {children}
      </ScrollArea>
      {footer ? (
        <div className="ui-sidebar__footer flex items-center justify-between gap-2 border-border border-t px-4 py-3">
          {footer}
        </div>
      ) : null}
    </>
  );

  if (wide) {
    return (
      <aside
        aria-label={label}
        className={cn(
          "ui-sidebar sticky top-0 flex h-dvh w-70 shrink-0 flex-col border-border border-r bg-bg text-fg max-lg:hidden",
          className,
        )}
      >
        {body}
      </aside>
    );
  }

  // Base UI owns the focus trap, the inert page, Escape, the backdrop press and focus
  // back to the opener, as it does for `Dialog`.
  return (
    <BaseDialog.Root open={open} onOpenChange={(next) => onOpenChange?.(next)}>
      <BaseDialog.Portal container={container}>
        {
          // The page dimmed with --bg rather than black: in a dark theme a light scrim would
          // read as a panel rather than as a shade.
        }
        <BaseDialog.Backdrop className="ui-sidebar__backdrop fixed inset-0 z-50 bg-[color-mix(in_oklab,var(--bg)_60%,transparent)]" />
        <BaseDialog.Popup
          aria-label={label}
          aria-modal="true"
          className={cn(
            "ui-sidebar ui-sidebar--open fixed inset-y-0 left-0 z-50 flex w-[min(20rem,85vw)] flex-col border-border border-r bg-bg text-fg shadow-lg outline-none transition-[translate] duration-(--duration-fast) data-ending-style:-translate-x-full data-starting-style:-translate-x-full",
            className,
          )}
        >
          <div className="ui-sidebar__close flex justify-end px-2 pt-2">
            <BaseDialog.Close
              aria-label={closeLabel}
              className={buttonClassName("ghost", "size-(--control-height) px-0")}
            >
              <Icon name="x" size={18} />
            </BaseDialog.Close>
          </div>
          {body}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
