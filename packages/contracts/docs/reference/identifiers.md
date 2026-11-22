---
title: identifiers
description: Why every UUID is branded, what branding costs, and where the parse boundary belongs.
---

# `Identifiers`

```ts
export class Identifiers {
  public static readonly organizationId: z.ZodBranded<z.ZodUUID, "OrganizationId">;
  public static readonly userId: z.ZodBranded<z.ZodUUID, "UserId">;
  // … one per id
}

export type OrganizationId = z.infer<typeof Identifiers.organizationId>;
export type UserId = z.infer<typeof Identifiers.userId>;
// …
```

The ids: `organizationId`, `userId`, `roleId`, `goalId`, `taskId`, `apiKeyId`, `invitationId`,
`notificationId`, `conversationId`, `messageId`, `docSpaceId`, `docPageId`.

`organizationId` is the tenant and sharding key ([Data and scale](../../../../docs/opinions/data-and-scale.md))
— the one id where a swapped argument is a cross-tenant leak, not an empty result.

---

## Branding is not decoration

Without it, every identifier in the system is `string`, and this compiles:

```ts
reactivateTask(goalId, taskId);   // signature is (taskId: string, goalId: string)
```

Swapped, and nothing objects: the query matches nothing and the empty result looks like missing data,
investigated in the wrong layer. Branded, it is a compile error — with a dozen UUID-shaped ids, a real
catch, regularly.

## What it costs

A branded value cannot be constructed by assignment. You have to parse:

```ts
const taskId = Identifiers.taskId.parse(raw);
```

The whole cost, paid where validation belongs anyway (an oRPC input, a Postgres row, a queue payload);
downstream the type travels with the value.

## The brand is compile-time only

```ts
const taskId = Identifiers.taskId.parse(UUID);
const goalId = Identifiers.goalId.parse(UUID);

taskId === goalId;   // true — same string
```

Nothing is added at runtime — a plain string in JSON, a plain `uuid` in Postgres. The spec asserts both
runtime equality and that cross-assignment is a `@ts-expect-error`.

## No message, here or anywhere

No custom message: a malformed id is a Zod `invalid_format` issue, which `ValidationError.fromIssues`
maps to `{ field, rule: "invalidFormat" }` and `content` renders as `error.field.invalidFormat`
([errors](../../../errors/docs/reference/error-normalizer.md)).

## Adding one

One member and one exported type — `Identifiers.invoiceId` / `InvoiceId`. A UUID that means something
belongs here; one that is just a UUID (a request or trace id) does not.
