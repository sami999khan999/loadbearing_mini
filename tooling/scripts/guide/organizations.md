## What it is

An **organization** (or tenant) is one customer's private space. Everything they create belongs
to it: members, roles, documents, docs, keys.

## Why it exists

So many customers can share one product while never seeing each other's data. See
[Where data lives](/docs/admin-guide/data) for how that is enforced.

## Step by step: creating one

:::steps
### Open New organization

Use the **New organization** button in the header, or go to `/organization/new`.

### Name it

Fill in **Organization name**. You will be its owner.

### Press Create organization

You are moved into it straight away.
:::

A new organization gets the four built-in roles (with you as **Owner**) and the plan set as the
default for new signups, or **unlimited** if none is set. Its address looks like `o-…`; it is not
made from the name.

## Switching between organizations

The **Organization** menu in the header lists every organization you belong to. Pick one to move
into it. The app remembers your choice for the next sign-in.

## Good to know

- One person can own up to **10** organizations (the setting `AUTH_MAX_OWNED_ORGANIZATIONS`).
  Past that: "This account owns as many organizations as it may."
- The app keeps a small stock of empty organizations ready, so creating one is instant.
- To remove an organization, a super admin [deletes the tenant](/docs/admin-guide/delete-tenant).
