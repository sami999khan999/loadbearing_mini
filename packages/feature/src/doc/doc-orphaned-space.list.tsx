import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  Button,
  Callout,
  DocMutations,
  DocQueries,
  type DocSpaceId,
  type DocSpaceOrphanListDto,
  readerClassName,
  useApiClient,
  useAppQuery,
  useState,
} from "../import.js";

// Private spaces whose author has left the organization. A manager sees each one's slug
// and may delete it, and nothing more: the title and the pages stay the author's.
export function DocOrphanedSpaceList() {
  const { t } = useMessages("doc");
  const describe = useErrorMessage();
  const client = useApiClient();
  const orphans = useAppQuery(DocQueries.orphanedSpaces(client));
  const remove = DocMutations.useDeleteSpace(client);
  const [confirming, setConfirming] = useState<DocSpaceId | null>(null);

  const items: DocSpaceOrphanListDto["items"] = orphans.data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <section className="ui-stack flex flex-col gap-3" aria-labelledby="doc-orphaned-spaces">
      <h2 id="doc-orphaned-spaces">{t("doc.orphan.title")}</h2>
      <p>{t("doc.orphan.description")}</p>
      <ul className="ui-stack flex flex-col gap-3">
        {items.map((space) => (
          <li key={space.id} className={readerClassName.actions}>
            <code>{space.slug}</code>
            <Button
              variant="danger"
              aria-label={
                confirming === space.id
                  ? t("doc.orphan.confirmFor", { slug: space.slug })
                  : t("doc.orphan.deleteFor", { slug: space.slug })
              }
              disabled={remove.isPending}
              onClick={() => {
                if (confirming !== space.id) return setConfirming(space.id);
                remove.mutate({ spaceId: space.id }, { onSuccess: () => setConfirming(null) });
              }}
            >
              {confirming === space.id ? t("doc.orphan.confirm") : t("doc.orphan.delete")}
            </Button>
          </li>
        ))}
      </ul>
      {remove.error ? <Callout tone="danger">{describe(remove.error)?.message}</Callout> : null}
    </section>
  );
}
