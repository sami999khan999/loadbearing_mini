import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  Button,
  Callout,
  DataTable,
  NotificationMutations,
  type NotificationPreferenceDto,
  NotificationQueries,
  useApiClient,
  useAppQuery,
} from "../import.js";

// Three buttons per cell rather than a `Select`: three options is a choice a person can
// see rather than open, and each one saves on its own.
const MODES = ["immediate", "digest", "off"] as const;
// A digest push means nothing, so push offers two (`26.3`).
const PUSH_MODES = ["immediate", "off"] as const;

export function NotificationPreferenceForm() {
  const { t } = useMessages("notification");
  const describe = useErrorMessage();
  const client = useApiClient();
  const preferences = useAppQuery(NotificationQueries.preferences(client));
  // No key, no push: the deployment sends none, so its rows would be choices that do nothing.
  const pushKey = useAppQuery(NotificationQueries.pushKey(client));
  const update = NotificationMutations.useUpdatePreference(client);

  if (preferences.isPending) return <DataTable.Skeleton columns={2} rows={2} />;
  if (preferences.isError) {
    return <Callout tone="danger">{describe(preferences.error)?.message}</Callout>;
  }

  return (
    <div>
      <p>{t("notification.preference.description")}</p>

      {preferences.data.items
        .filter(
          (row: NotificationPreferenceDto) => row.channel !== "push" || pushKey.data?.publicKey,
        )
        .map((row: NotificationPreferenceDto) => (
          <fieldset key={`${row.category}:${row.channel}`}>
            <legend>
              {t(`notification.preference.category.${row.category}` as never)} ·{" "}
              {t(`notification.preference.channel.${row.channel}` as never)}
            </legend>

            {(row.channel === "push" ? PUSH_MODES : MODES).map((mode) => (
              <Button
                key={mode}
                // The current value is the pressed one. `aria-pressed` rather than a
                // radio group, because these submit on click and never on a form submit.
                variant={row.mode === mode ? "primary" : "secondary"}
                aria-pressed={row.mode === mode}
                onClick={() =>
                  update.mutate({ category: row.category, channel: row.channel, mode })
                }
              >
                {t(`notification.preference.mode.${mode}` as never)}
              </Button>
            ))}
          </fieldset>
        ))}

      {update.isError ? <Callout tone="danger">{describe(update.error)?.message}</Callout> : null}
    </div>
  );
}
