import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  Button,
  Callout,
  Dialog,
  type DocPageId,
  DocQueries,
  fieldClassName,
  useApiClient,
  useAppQuery,
  useMemo,
  useState,
} from "../import.js";
import { type DocDiffKind, type DocDiffLine, DocLineDiff } from "./doc-line-diff.js";

export interface DocRevisionDiffPanelProps {
  readonly pageId: DocPageId;
  readonly revisionNo: number;
  // The saved draft, the right-hand side of the comparison.
  readonly draftMarkdown: string;
  readonly onClose: () => void;
}

// Unchanged lines kept either side of a change; longer runs fold behind one button.
const CONTEXT = 3;

// Tinted into the surface as StatusBadge does: --success is a fill, never a foreground.
const ROW: Record<DocDiffKind, string> = {
  added: "bg-[color-mix(in_oklab,var(--success)_14%,var(--surface))]",
  removed: "bg-[color-mix(in_oklab,var(--danger)_14%,var(--surface))]",
  same: "",
};
const SIGN: Record<DocDiffKind, string> = { added: "+", removed: "−", same: " " };
const NUMBER = "select-none px-2 text-right text-fg-muted tabular-nums";

// One revision's Markdown against the draft. Mounted only while open, so the revision is
// fetched on the first Compare and served from the cache after.
export function DocRevisionDiffPanel({
  pageId,
  revisionNo,
  draftMarkdown,
  onClose,
}: DocRevisionDiffPanelProps) {
  const { t } = useMessages("doc");
  const describe = useErrorMessage();
  const client = useApiClient();
  const revision = useAppQuery(DocQueries.revision(client, pageId, revisionNo));
  const [unfolded, setUnfolded] = useState<ReadonlySet<number>>(() => new Set());

  const before = revision.data?.markdown;
  const lines = useMemo(
    () => (before === undefined ? undefined : DocLineDiff.lines(before, draftMarkdown)),
    [before, draftMarkdown],
  );
  const blocks = useMemo(() => (lines ? DocLineDiff.blocks(lines, CONTEXT) : []), [lines]);

  const row = (line: DocDiffLine) => (
    <tr key={`${line.before ?? ""}:${line.after ?? ""}`} className={ROW[line.kind]}>
      <td className={NUMBER}>{line.before ?? ""}</td>
      <td className={NUMBER}>{line.after ?? ""}</td>
      <td className="select-none px-1 text-fg-muted" aria-hidden="true">
        {SIGN[line.kind]}
      </td>
      <td className="whitespace-pre-wrap break-words pr-2">
        {line.kind === "same" ? null : (
          <span className="sr-only">{t(`doc.revision.${line.kind}`)} </span>
        )}
        {line.text}
      </td>
    </tr>
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("doc.revision.compareTitle", { revision: revisionNo })}
      description={t("doc.revision.compareHint")}
      className="w-[min(60rem,calc(100vw-2rem))]"
      actions={
        <Button variant="secondary" onClick={onClose}>
          {t("doc.revision.close")}
        </Button>
      }
    >
      {revision.isPending ? (
        <p className={fieldClassName.hint}>{t("doc.revision.loading")}</p>
      ) : null}
      {revision.error ? <Callout tone="danger">{describe(revision.error)?.message}</Callout> : null}
      {lines === null ? <Callout tone="warning">{t("doc.revision.tooLarge")}</Callout> : null}
      {lines && !DocLineDiff.changed(lines) ? (
        <p className={fieldClassName.hint}>{t("doc.revision.same")}</p>
      ) : null}
      {lines && DocLineDiff.changed(lines) ? (
        <div className="ui-doc-diff overflow-x-auto rounded-md border border-border">
          <table className="w-full border-collapse font-mono text-sm leading-relaxed">
            <tbody>
              {blocks.flatMap((block) =>
                block.kind === "lines" || unfolded.has(block.at)
                  ? block.lines.map(row)
                  : [
                      <tr key={`fold-${block.at}`} className="bg-muted">
                        <td colSpan={4} className="px-2 py-1">
                          <Button
                            variant="ghost"
                            onClick={() => setUnfolded((open) => new Set(open).add(block.at))}
                          >
                            {t("doc.revision.unfold", { count: block.lines.length })}
                          </Button>
                        </td>
                      </tr>,
                    ],
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </Dialog>
  );
}
