import { cn } from "../../class-name/index.js";
import type { ReactNode } from "../../import.js";

export interface AppLayoutProps {
  // A `Sidebar`, normally: a column on a wide screen and a drawer on a narrow one.
  readonly sidebar: ReactNode;
  // Always shown, above the page. On a narrow screen it holds the button that opens the drawer.
  readonly topbar: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

// The signed-in shell's links, so the module nav and the account links look the same and
// the current page is marked by more than colour: weight and a filled row.
export const appLayoutClassName = Object.freeze({
  nav: "ui-app__nav flex flex-col gap-0.5",
  link: "ui-app__link flex items-center gap-2 rounded-md px-2 py-1.5 text-fg-muted text-sm no-underline transition-colors duration-(--duration-fast) hover:bg-muted hover:text-fg",
  linkActive: "bg-muted font-medium text-fg",
  section: "ui-app__section mt-4 mb-1 px-2 font-semibold text-fg-muted text-xs uppercase",
});

// Navigation down the side, a bar across the top and the page beside them. Knows nothing
// about modules or sessions: the caller fills each part.
export function AppLayout({ sidebar, topbar, children, className }: AppLayoutProps) {
  return (
    <div className={cn("ui-app flex min-h-dvh bg-bg text-fg", className)}>
      {sidebar}
      <div className="ui-app__main flex min-w-0 flex-1 flex-col">
        <div className="ui-app__topbar sticky top-0 z-30 flex min-h-14 items-center gap-3 border-border border-b bg-bg px-4 py-2">
          {topbar}
        </div>
        <div className="ui-app__content min-w-0 flex-1 px-8 py-8 max-lg:px-4 max-lg:py-6">
          {children}
        </div>
      </div>
    </div>
  );
}
