---
title: "ERROR_COPY, FIELD_RULE_COPY, ErrorCopy"
description: ERROR_COPY, FIELD_RULE_COPY and ErrorCopy — the only place in the repository where a failure gets words, and the reason @loadbearing/errors has no message field.
---

# `ERROR_COPY`, `FIELD_RULE_COPY`, `ErrorCopy`

```ts
import type { ErrorCode, ErrorEnvelope, FieldViolation } from "@loadbearing/errors";
import type { Translator } from "../translator.js";
import type { ShellMessageKey } from "./namespace.js";

export const ERROR_COPY: Readonly<Record<ErrorCode, ShellMessageKey>> = {
  UNAUTHORIZED: "error.unauthorized",
  FORBIDDEN: "error.forbidden",
  NOT_FOUND: "error.notFound",
  CONFLICT: "error.conflict",
  BAD_REQUEST: "error.unexpected",
  TWO_FACTOR_REQUIRED: "error.twoFactorRequired",
  RATE_LIMITED: "error.rateLimited",
  UNAVAILABLE: "error.unexpected",
  INTERNAL: "error.unexpected",
  SERVER_ONLY: "error.serverOnly",
};

export const FIELD_RULE_COPY: Readonly<Record<string, ShellMessageKey>> = {
  required: "error.field.required",
  tooShort: "error.field.tooShort",
  tooLong: "error.field.tooLong",
  invalidFormat: "error.field.invalidFormat",
  invalid: "error.field.invalid",
};
```

---

## Usage

```ts
const t = await content.translator(locale, []);

ErrorCopy.message(t, envelope);   // the sentence at the top of an error page
ErrorCopy.fields(t, envelope);    // one sentence per field violation, in order
ErrorCopy.field(t, violation);    // a single violation, for an inline field error
```

`envelope` is the wire value, or `ErrorNormalizer.normalize(thrown).toJSON()` on the server;
`ErrorCopy` reads only `code`, `context` and `fields`.

---

## `ERROR_COPY` is total, by construction

`Record<ErrorCode, ShellMessageKey>` makes a new code **fail to compile** until it has copy — the point
of a map here rather than a component `switch`, preventing a raw `SERVER_ONLY` on a customer's screen. A
runtime test asserts it too, since widening the value type weakens the compile check. **Codes share
messages on purpose:** `BAD_REQUEST`, `UNAVAILABLE` and `INTERNAL` all read "Something went wrong.
Please try again." — a distinction for operators' logs, not users.

---

## The value type is `ShellMessageKey`, and that is load-bearing

`common` and `error` are the namespaces every `ContentSource` snapshot guarantees
([`ContentSource`](content-source.md)); `nav`, `auth`, `email` and the rest load when a route asks. A key
into an unloaded namespace renders as **the key itself** — correct
([`Translator`](translator.md#a-missing-key-renders-as-the-key)), except on an error page, reached when
something has already gone wrong.

> [!WARNING]
> An earlier `TWO_FACTOR_REQUIRED: "auth.twoFactorRequired"` would have rendered literally on any route
> not loading `auth`. `ShellMessageKey` makes that unrepresentable — why `error.twoFactorRequired` lives
> in `error` though it is about authentication.

---

## `FIELD_RULE_COPY` cannot be total, and says so

`ValidationError` maps Zod issues to five rules — `required`, `tooShort`, `tooLong`, `invalidFormat`,
and catch-all `invalid` — but Zod's codes are open and change between majors, so this map stays open; an
unknown rule falls back to `error.unexpected`. The test drives from `ValidationError.fromIssues`, so a
new mapping in `errors` cannot arrive without copy:

```ts
for (const violation of ValidationError.fromIssues(issues).fields ?? []) {
  expect(FIELD_RULE_COPY[violation.rule], violation.rule).toBeTypeOf("string");
}
```

---

## Why `ErrorCopy` is a class and not two call sites

It was once two lines to copy around:

```ts
t(ERROR_COPY[error.code], error.context);
t(FIELD_RULE_COPY[violation.rule] ?? "error.unexpected", violation.params);
```

Both fail only on screen:

- **The second drops the field name** — `violation.params` is `{ min: 10 }`, the name is the sibling
  `violation.field`, so users read `"{field} must be at least 10 characters."` `ErrorCopy.field` merges it.
- **The first does not typecheck with a narrow `t()`** — `ErrorContext` allows `boolean`, so
  `Translator.t` takes [`MessageParams`](namespace.md#messageparams) (the same shape), not
  `Record<string, string | number>`; narrowing invites a cast.
- **The `?? "error.unexpected"` fallback gets forgotten** where the rule set is open.

It is also where the seam is tested from this side: `errors` asserts `ServerOnlyError` names its context
key `package`; this package asserts the rendered sentence is whole.

---

## `error.serverOnly`, and the exception that stopped existing

```ts
ServerOnly.assert("@loadbearing/infrastructure");
// ServerOnlyError: SERVER_ONLY   context: { package: "@loadbearing/infrastructure" }

ErrorCopy.message(t, error.toJSON());
// "@loadbearing/infrastructure was imported into a client bundle. This is a leak, not a bundle-size
//  problem — it means database or credential code is reachable from the browser."
```

That sentence was once a template literal in `ServerOnly.assert` — the one error allowed a message. It
is copy now, `{package}` from context, so **the rule holds with no exceptions**
([core's `ServerOnly`](../../../core/docs/reference/server-only.md#why-the-hardest-case-for-prose-still-loses)).
It stays untranslated in `bn/error.ts`: a console reader wants a searchable string.

---

## Who calls this

Only `feature`'s `useErrorMessage`: it normalises what a query or mutation threw and renders the code
and violations into one object. Nine components once showed a generic "Something went wrong" though the
server had said *which* thing — `FORBIDDEN` and `CONFLICT` deserve different words. `apps/web`'s root
`errorComponent` uses the same hook, so an uncaught throw gets the catalog sentence, not a stack trace.
**Two call sites branch first, rightly** — a `NOT_FOUND` invitation and a `CONFLICT` invite have more
specific slice copy — then fall through to `ErrorCopy`.

---

## See also

- [namespace](namespace.md) — `ShellMessageKey`, and why it is not `MessageKey`
- [Translator](translator.md) — interpolation, and what a missing key does
- [`@loadbearing/errors`](../../../errors/docs/index.md) — the codes these words are keyed to
- [`ServerOnly`](../../../core/docs/reference/server-only.md) — the one caller that throws at module load
