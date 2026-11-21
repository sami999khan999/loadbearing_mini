---
title: token
description: Token — an opaque random string and the digest of one, in core because both application and infrastructure need it and neither can reach auth.
---

# `Token`

```ts
export class Token {
  public static random(bytes = 32): string;
  public static hash(value: string): Promise<string>;
}
```

Two static methods and no instances. `random()` returns hex over `bytes` of CSPRNG output;
`hash()` returns the SHA-256 of a string, also hex.

## Why it is in `core` and not beside `ApiKeyHasher`

`ApiKeyHasher` in [`auth`](../../../auth/docs/index.md) does the same for API keys, but invitations need
it on both sides — `InviteMemberUseCase` (`application`) hashes to save, `PgInvitationClaimer`
(`infrastructure`) to look up — and neither can import `auth` ([Layering](../../../../docs/ai/rules/layering.md)).
The test for this package: does more than one layer need it, with no seam for a fake between them?

## The pairing is the point

**`random()` goes to the recipient; `hash()` to the table.** An invitation token plus a verified mailbox
joins a tenant, so `invitations.token_hash` stores the digest and the plaintext lives only in the mail and
URL — a dump grants nothing, as with `api_keys.token_hash`.

## Both globals are read off `globalThis`

```ts
type WebCrypto = {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
  subtle: { digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer> };
};
```

`lib: ["ES2024"]` declares neither `crypto` nor `TextEncoder`, and a DOM or Node lib would bind the
package to one runtime ([uuid](uuid.md#why-crypto-is-not-a-global-here)). `hash()` is `async` because
`subtle.digest`, Web Crypto's only digest, returns a promise; a hand-written sync SHA-256 is a dependency
or a bug.
