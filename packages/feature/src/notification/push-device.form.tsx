import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  Button,
  Callout,
  NotificationMutations,
  NotificationQueries,
  useApiClient,
  useAppQuery,
} from "../import.js";

// Push for this browser (`26.3`). A subscription is a device's, so each browser a person
// uses is turned on here separately; the grid above decides what reaches them.
export function PushDeviceForm() {
  const { t } = useMessages("notification");
  const describe = useErrorMessage();
  const client = useApiClient();
  const key = useAppQuery(NotificationQueries.pushKey(client));
  const device = useAppQuery(NotificationQueries.pushDevice());
  const enable = NotificationMutations.useEnablePush(client);
  const disable = NotificationMutations.useDisablePush(client);

  const publicKey = key.data?.publicKey;
  if (!publicKey || device.isPending) return null;

  return (
    <section aria-labelledby="push-device-title">
      <h2 id="push-device-title">{t("notification.push.title")}</h2>
      <p>{t("notification.push.description")}</p>
      {device.data === "unsupported" ? (
        <Callout tone="info">{t("notification.push.unsupported")}</Callout>
      ) : device.data === "on" ? (
        <>
          <p>{t("notification.push.on")}</p>
          <Button variant="secondary" onClick={() => disable.mutate(undefined)}>
            {t("notification.push.disable")}
          </Button>
        </>
      ) : (
        <Button onClick={() => enable.mutate({ publicKey })}>
          {t("notification.push.enable")}
        </Button>
      )}
      {
        // A refused permission is the browser's answer, not a server error, so it says how.
        enable.isError ? (
          <Callout tone="danger">
            {enable.error.message === "FORBIDDEN"
              ? t("notification.push.denied")
              : describe(enable.error)?.message}
          </Callout>
        ) : null
      }
      {disable.isError ? <Callout tone="danger">{describe(disable.error)?.message}</Callout> : null}
    </section>
  );
}
