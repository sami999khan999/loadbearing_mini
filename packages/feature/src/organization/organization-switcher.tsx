import { useSession } from "../auth/index.js";
import { useMessages } from "../i18n/index.js";
import {
  Button,
  fieldClassName,
  type OrganizationClient,
  OrganizationMutations,
  Select,
} from "../import.js";

export interface OrganizationSwitcherProps {
  readonly organization: OrganizationClient;
  // Runs once the session points at the new tenant. The call site clears the cache, for
  // the reason sign-out does: every cached row belongs to the tenant just left.
  readonly onSwitched: () => void;
  // Where "New organization" goes. A callback, because `feature` may not import routing.
  readonly onCreate: () => void;
}

// Off the session snapshot, not a query: `fetchSession` already carries every membership,
// so the switcher is right on the first painted byte.
export function OrganizationSwitcher({
  organization,
  onSwitched,
  onCreate,
}: OrganizationSwitcherProps) {
  const { t } = useMessages("nav");
  const { user } = useSession();
  const switchTo = OrganizationMutations.useSwitch(organization, onSwitched);

  if (!user) return null;

  return (
    // Stacked: it sits at the head of the shell's sidebar, which is narrower than one row.
    <span className="ui-organization-switcher flex flex-col gap-1.5">
      <label className={fieldClassName.label} htmlFor="organization-switcher">
        {t("nav.organization")}
      </label>
      <Select
        id="organization-switcher"
        label={t("nav.organization")}
        value={user.activeOrganizationId}
        disabled={switchTo.isPending}
        // `disabled` alone removes it from the tab order and says nothing about why.
        aria-busy={switchTo.isPending}
        onValueChange={(organizationId) => switchTo.mutate({ organizationId })}
        options={user.organizations.map((candidate) => ({
          value: candidate.id,
          label: candidate.name,
        }))}
      />
      <Button variant="ghost" className="self-start px-2" onClick={onCreate}>
        {t("nav.organizationNew")}
      </Button>
    </span>
  );
}
