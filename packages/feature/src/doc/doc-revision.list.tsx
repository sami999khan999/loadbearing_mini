import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  Button,
  Callout,
  DateFormat,
  DocMutations,
  type DocPageId,
  DocQueries,
  fieldClassName,
  useApiClient,
  useAppQuery,
  useState,
} from "../import.js";
import { DocRevisionDiffPanel } from "./doc-revision-diff.panel.js";

export interface DocRevisionListProps {
  readonly pageId: DocPageId;
  // The version the editor holds. A restore names it, like a save does.
  readonly draftVersion: number;
  // The saved draft's Markdown, what a revision is compared against.
  readonly draftMarkdown: string;
  // Called with the restored draft, so the shell can remount the editor over it.
  readonly onRestored: () => void;
}

// Every publish, newest first. A restore puts that text back into the draft and nothing
// more: making it live again is a publish, a second decision.
export function DocRevisionList({
  pageId,
  draftVersion,
  draftMarkdown,
  onRestored,
}: DocRevisionListProps) {
  const { t } = useMessages("doc");
  const describe = useErrorMessage();
  const client = useApiClient();
  const revisions = useAppQuery(DocQueries.revisions(client, pageId));
  const restore = DocMutations.useRestoreRevision(client);

  const [comparing, setComparing] = useState<number | null>(null);

  const items = revisions.data?.items ?? [];

  return (
    <section className="ui-stack flex flex-col gap-3" aria-labelledby="doc-revisions">
      <h2
        id="doc-revisions"
        className="ui-toc__title m-0 mb-3 flex items-center gap-2 text-fg-muted"
      >
        {t("doc.revision.title")}
      </h2>
      {items.length === 0 ? <p className={fieldClassName.hint}>{t("doc.revision.none")}</p> : null}
      <ol className="ui-stack flex flex-col gap-3">
        {items.map((revision) => (
          <li key={revision.revisionNo}>
            <strong>{t("doc.revision.item", { revision: revision.revisionNo })}</strong>
            <br />
            <span className={fieldClassName.hint}>
              {revision.title} · {DateFormat.day(revision.createdAt)}
            </span>
            <br />
            <Button
              variant="ghost"
              disabled={restore.isPending}
              onClick={() =>
                restore.mutate(
                  { pageId, revisionNo: revision.revisionNo, draftVersion },
                  { onSuccess: onRestored },
                )
              }
            >
              {t("doc.revision.restore")}
            </Button>
            <Button variant="ghost" onClick={() => setComparing(revision.revisionNo)}>
              {t("doc.revision.compare")}
            </Button>
          </li>
        ))}
      </ol>
      {comparing === null ? null : (
        <DocRevisionDiffPanel
          pageId={pageId}
          revisionNo={comparing}
          draftMarkdown={draftMarkdown}
          onClose={() => setComparing(null)}
        />
      )}
      {restore.isSuccess ? (
        <Callout tone="info">
          {t("doc.revision.restored", { revision: restore.variables.revisionNo })}
        </Callout>
      ) : null}
      {restore.error ? <Callout tone="danger">{describe(restore.error)?.message}</Callout> : null}
    </section>
  );
}
