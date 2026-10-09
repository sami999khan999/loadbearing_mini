import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { Route } from "../../src/route/(app)/doc/$space/$.js";

const HTML = "<p>the whole article, once</p>";

// Loader data is serialised whole into the page; the query cache is the copy that
// `ArticleHtmlStore` strips. So the HTML may sit in the cache and nowhere in the return.
describe("/doc/$space/$ loader", () => {
  it("returns no page HTML, which stays in the query cache", async () => {
    const queryClient = new QueryClient();
    const api = {
      docPage: { read: () => Promise.resolve({ space: { id: "s" }, page: { html: HTML } }) },
      docSpace: { list: () => Promise.resolve({ items: [] }) },
    };
    const context = { api, queryClient, messages: { ensure: () => Promise.resolve() } };

    const fn = Route.options.loader as (args: unknown) => Promise<unknown>;
    const data = await fn({ context, params: { space: "s", _splat: "p" } });

    expect(JSON.stringify(data ?? null)).not.toContain(HTML);
    expect(
      JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).toContain(HTML);
  });
});
