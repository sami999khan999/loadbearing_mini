# Visibility

Three independent reasons something is missing from a screen in lite. Each only narrows the one
above it.

| Mechanism | Owner | Reach | What the API says |
|---|---|---|---|
| **Flag** | engineering, temporary | the deployment, or a list of orgs | `NOT_FOUND` |
| **Entitlement** | platform admin | one org — a plan plus adjustments | `FORBIDDEN` |
| **Permission** | org admin | a role, or one user | `FORBIDDEN` |

- **Entitlement is a mask, not a step.** It narrows the `CapabilitySet` on the server, so `<Can>`,
  the nav, `RouteGuard` and `Authorizer.assert` obey a plan unaware. **Grants are filtered, never
  deleted** (an upgrade restores roles at once). `core` and `platform`-scope keys are never masked.
- **A flag check throws `NOT_FOUND` carrying no flag key** (`error.toJSON()` reaches the browser).
  **A flag is not a secret** — client-gating names are in the bundle.
- **A new flag is a fragment file plus one spread** in `permissions`' `flag/` barrel. Every flag
  declares an owner and an expiry.
- **`<Can>` gates an affordance**, never a whole screen's route — routes use `RouteGuard`.
- **Never lazy-load by permission** — it hides nothing and adds a waterfall.
- **Hiding is not revoking.** The API, bookmarks and nav still work; `Authorizer.assert` on the
  server is the gate, nothing on the client.
- **A platform admin is not a tenant owner.** `wildcard` is never set in production; platform
  admins hold tenant powers only inside the platform organization, and elsewhere only the role
  that tenant gave them.
- **A doc's access link adds no mechanism** — a page linked to a module, permission, flag or plan
  resolves through the three above and hides as `NOT_FOUND`
  (`packages/application/docs/reference/doc.md`).

**Widget preference, with zones, is not in lite.** A per-user "hide this card" is not a flag,
entitlement or permission and must not be faked with one. It returns whole, with its resolution
order and ten rules, from [`docs/scale/`](../../scale/index.md).

Argument: [`docs/opinions/visibility.md`](../../opinions/visibility.md).
