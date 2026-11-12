import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import { AssistantQueries, Callout, useApiClient, useAppQuery } from "../import.js";

// The tenant's own meter: today against the daily cap, and the month so far. Read from
// Postgres, so it works on a deployment with no analytics store.
export function AssistantUsagePanel() {
  const { t } = useMessages("assistant");
  const describe = useErrorMessage();
  const client = useApiClient();
  const usage = useAppQuery(AssistantQueries.usage(client));

  if (usage.isError) return <Callout tone="danger">{describe(usage.error)?.message}</Callout>;
  if (!usage.isSuccess) return null;

  const { today, month, dailyTokenLimit } = usage.data;
  const todayTokens = today.inputTokens + today.outputTokens;

  return (
    <section className="ui-assistant-usage flex flex-col gap-1">
      <h2>{t("assistant.usage.title")}</h2>
      <p>
        {dailyTokenLimit > 0
          ? t("assistant.usage.today", { tokens: todayTokens, limit: dailyTokenLimit })
          : t("assistant.usage.todayUncapped", { tokens: todayTokens })}
      </p>
      <p className="text-fg-muted">
        {t("assistant.usage.month", {
          tokens: month.inputTokens + month.outputTokens,
          answers: month.answers,
        })}
      </p>
    </section>
  );
}
