import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  Button,
  Callout,
  Field,
  Input,
  type OrganizationId,
  PlatformMutations,
  PlatformQueries,
  useApiClient,
  useAppQuery,
  useState,
} from "../import.js";

// Every byte the customer owns, as one object per table plus a manifest. The links are
// presigned and short-lived, so the list is read fresh rather than cached.
export function TenantExportPanel() {
  const { t } = useMessages("platform");
  const describe = useErrorMessage();
  const client = useApiClient();
  const start = PlatformMutations.useExportTenant(client);
  const images = PlatformMutations.useExportImageLinks(client);

  const [typed, setTyped] = useState("");
  const organizationId =
    typed.trim().length === 36 ? (typed.trim() as OrganizationId) : ("" as OrganizationId);

  const exports = useAppQuery({
    ...PlatformQueries.exports(client, organizationId),
    enabled: organizationId !== "",
  });
  const days = [...new Set((exports.data ?? []).map((object) => object.day))];

  // The copied images, as one tab-separated file of path and link: thousands of them
  // are fetched by a loop, not clicked. See infrastructure's cold-storage.md.
  const saveImageLinks = (day: string) =>
    images.mutate(
      { organizationId, day },
      {
        onSuccess: (list) => {
          if (list.length === 0) return;
          const text = list.map((image) => `${image.path}\t${image.url}\n`).join("");
          const href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
          const anchor = document.createElement("a");
          anchor.href = href;
          anchor.download = `doc-images-${organizationId}-${day}.tsv`;
          anchor.click();
          // After the click has handed the URL over: revoked in the same task, some browsers
          // cancel the download before it starts.
          setTimeout(() => URL.revokeObjectURL(href), 0);
        },
      },
    );

  return (
    <section>
      <h2>{t("platform.tenantExport.title")}</h2>
      <p>{t("platform.tenantExport.description")}</p>

      <Field label={t("platform.storage.filter")} htmlFor="tenant-export-org">
        <Input
          id="tenant-export-org"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      </Field>

      <Button
        disabled={organizationId === "" || start.isPending}
        onClick={() => start.mutate({ organizationId })}
      >
        {t("platform.tenantExport.action")}
      </Button>

      {start.isSuccess ? (
        <Callout tone="success">
          {t("platform.tenantExport.queued", { jobId: start.data.jobId })}
        </Callout>
      ) : null}
      {start.isError ? <Callout tone="danger">{describe(start.error)?.message}</Callout> : null}

      {exports.isSuccess && exports.data.length === 0 ? (
        <p>{t("platform.tenantExport.empty")}</p>
      ) : null}
      {exports.isSuccess && exports.data.length > 0 ? (
        <ul>
          {exports.data.map((object) => (
            <li key={object.key}>
              {
                // A plain anchor: the URL is presigned and points at the bucket, so
                // routing it through this app would be a second copy of every byte.
                <a href={object.url}>{object.key}</a>
              }
            </li>
          ))}
        </ul>
      ) : null}
      {days.length > 0 ? (
        <>
          <p>{t("platform.tenantExport.imagesHint")}</p>
          <ul>
            {days.map((day) => (
              <li key={day}>
                <Button
                  variant="secondary"
                  disabled={images.isPending}
                  onClick={() => saveImageLinks(day)}
                >
                  {t("platform.tenantExport.images", { day })}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {images.isSuccess && images.data.length === 0 ? (
        <Callout tone="info">{t("platform.tenantExport.imagesNone")}</Callout>
      ) : null}
      {images.isError ? <Callout tone="danger">{describe(images.error)?.message}</Callout> : null}
      {exports.isError ? <Callout tone="danger">{describe(exports.error)?.message}</Callout> : null}

      <p>{t("platform.tenantExport.expiry")}</p>
    </section>
  );
}
