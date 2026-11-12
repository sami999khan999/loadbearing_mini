import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { Endpoint } from "~/endpoint.js";
import {
  AppLayout,
  AuthClient,
  appLayoutClassName,
  Button,
  Can,
  CapabilitySet,
  type ClientNamespace,
  Icon,
  ModuleNav,
  NotificationBell,
  NotificationQueries,
  OrganizationClient,
  OrganizationSwitcher,
  type ReactNode,
  RealtimeProvider,
  ROUTES,
  Sidebar,
  SignOutButton,
  useApiClient,
  useCapabilities,
  useEffect,
  useMemo,
  useMessages,
  useState,
} from "~/import.js";
import { Pending } from "~/route/-boundary.js";
import { RouteGuard } from "~/route/-guard.js";
import { LocaleSwitcher } from "~/route/-locale.js";
import { refreshSession } from "~/route/-session.js";

// `nav` for the gated destinations below; `auth` for everything else the header says.
const MESSAGES = ["nav"] as const satisfies readonly ClientNamespace[];

// The one place that says every page under `(app)` needs a session. Pathless: the
// leading underscore keeps `_authenticated` out of the URL.
export const Route = createFileRoute("/(app)/_authenticated")({
  beforeLoad: RouteGuard.requireSession(),
  // The header renders `auth` copy on every page in this subtree, so the namespace is
  // ensured here rather than in each leaf.
  staticData: { messages: MESSAGES },
  // The menu is content, so it is loaded like content. Both in parallel: neither
  // depends on the other and the header needs both before it renders.
  loader: async ({ context }) => {
    // The same key the `<Can>` around the bell asks below, so a member who cannot see it
    // issues no count query rather than one the procedure refuses.
    const counted = CapabilitySet.from(context.capabilities).can("notification.inbox.read")
      ? context.queryClient.ensureQueryData(NotificationQueries.unreadCount(context.api))
      : Promise.resolve(null);

    // The logo goes through `ContentSource.media()` rather than importing the file:
    // content records hold `"brand.logo"`, never a path, so a CDN is one adapter.
    const [, nav, logo] = await Promise.all([
      context.messages.ensure(MESSAGES),
      context.content.nav(),
      context.content.media("brand.logo"),
      counted,
    ]);

    return { nav, logo };
  },
  component: AuthenticatedLayout,
  // Covers every page below, so a leaf whose loader prefetches — `/settings/roles`
  // does — has a state to show rather than a blank frame.
  pendingComponent: Pending,
});

function AuthenticatedLayout() {
  const { t } = useMessages("nav");
  const { nav, logo } = Route.useLoaderData();
  const capabilities = useCapabilities();
  const navigate = useNavigate();
  const router = useRouter();
  const { session, queryClient, appearance, appearanceSnapshot } = Route.useRouteContext();

  // Here rather than in `__root`, because a stream opened before there is a session is
  // a request that 401s and then retries forever.
  const api = useApiClient();
  const auth = useMemo(() => new AuthClient({ baseUrl: Endpoint.auth }), []);
  const organization = useMemo(() => new OrganizationClient(auth), [auth]);

  const refresh = (to: "/" | "/sign-in") => () =>
    refreshSession({
      queryClient,
      session,
      invalidateRouter: () => router.invalidate(),
      go: () => void navigate({ to }),
    });

  // After a switch every cached row belongs to the tenant just left, and the snapshot
  // names the old one — the same reason a sign-out clears.
  const signedOut = refresh("/sign-in");
  const switched = refresh("/");

  // Closed by every navigation: a drawer left open would cover the page just asked for.
  const [open, setOpen] = useState(false);
  const pathname = useLocation({ select: (location) => location.pathname });
  useEffect(() => {
    if (pathname) setOpen(false);
  }, [pathname]);

  const link = (to: string, label: string, icon: ReactNode = null) => (
    <Link
      key={to}
      to={to}
      className={appLayoutClassName.link}
      activeProps={{ className: appLayoutClassName.linkActive, "aria-current": "page" }}
    >
      {icon}
      {label}
    </Link>
  );

  const sidebar = (
    <Sidebar
      label={t("nav.menu")}
      open={open}
      onOpenChange={setOpen}
      closeLabel={t("nav.menuClose")}
      header={
        <>
          {
            // A mask painted with --fg, not an `<img>`: an image's `currentColor` is always
            // black, which drew the logo black in every dark theme.
          }
          <span
            role="img"
            aria-label={logo.alt}
            className="ui-app__logo block bg-fg"
            style={{
              width: logo.width,
              height: logo.height,
              maskImage: `url("${logo.src}")`,
              maskRepeat: "no-repeat",
              maskSize: "contain",
            }}
          />
          <OrganizationSwitcher
            organization={organization}
            onSwitched={switched}
            onCreate={() => void navigate({ to: "/organization/new" })}
          />
        </>
      }
      footer={
        <>
          <LocaleSwitcher appearance={appearance} current={appearanceSnapshot.locale} />
          <SignOutButton auth={auth} onSignedOut={signedOut} />
        </>
      }
    >
      {
        // The gated half, from `ContentSource.nav()` joined to `MODULE_GATES`. A link
        // hidden here still answers FORBIDDEN if the path is typed by hand.
      }
      <ModuleNav
        items={nav}
        capabilities={capabilities}
        className={appLayoutClassName.nav}
        renderLink={(route, label, icon) => link(route, label, icon)}
      />
      {
        // Ungated on purpose: your own account and security pages need no capability,
        // which is why `account.routes.ts` declares no gate for them.
      }
      <p className={appLayoutClassName.section}>{t("nav.yourAccount")}</p>
      <nav aria-label={t("nav.account")} className={appLayoutClassName.nav}>
        {link("/settings/account", t("nav.account"))}
        {link("/settings/security", t("nav.security"))}
      </nav>
    </Sidebar>
  );

  const topbar = (
    <>
      <Button
        variant="ghost"
        className="lg:hidden"
        aria-label={t("nav.menuOpen")}
        onClick={() => setOpen(true)}
      >
        <Icon name="menu" size={18} />
      </Button>
      <span className="ml-auto" />
      {
        // An affordance, so `<Can>`: the inbox route and its procedures are the gate.
        <Can permission="notification.inbox.read" capabilities={capabilities}>
          <NotificationBell href={ROUTES.notification.inbox} />
        </Can>
      }
    </>
  );

  return (
    <RealtimeProvider client={api} organizationId={session.user?.activeOrganizationId ?? null}>
      {
        // First in the tab order and visible only while focused: without it a keyboard
        // reader walks the whole sidebar again on every navigation.
      }
      <a className="ui-skip-link" href="#main">
        {t("nav.skip")}
      </a>
      <AppLayout sidebar={sidebar} topbar={topbar}>
        {
          // The landmark the skip link targets, and the one a screen reader jumps to.
          // `tabIndex={-1}` so the anchor moves focus rather than only scrolling.
        }
        <main id="main" tabIndex={-1} className="outline-none">
          <Outlet />
        </main>
      </AppLayout>
    </RealtimeProvider>
  );
}
