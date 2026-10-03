## What it is

An **API key** is a long secret that lets a program, such as a script or another service, act for
an organization without anyone's password.

## Why it exists

A password belongs to a person and can do everything they can. A key can be limited to a few
permissions, named for its purpose, and switched off on its own without touching anyone's account.

## Step by step: creating a key

:::steps
### Open API keys

**Settings** → **API keys**.

### Describe it

Under **New API key**, fill in **What is it for?**, a name you will still recognise in six months.

### Pick its scopes

Tick what the key may do under **Scopes**. You can only give a key permissions you hold yourself.

### Press Create key

The key appears **once**: "Copy this key now". Copy it, then press **I have copied it**.
:::

> [!CAUTION]
> **The key is shown only once.** It is stored as a one-way fingerprint, so nobody, not even
> you, can see it again. If it is lost, revoke it and make a new one.

## How a program uses it

The key starts with `rk_`. The program sends it in a header with every request:

```sh
curl -H "x-api-key: rk_…" http://localhost:23000/api/rpc/…
```

## Revoking

Press **Revoke** on the key's row and confirm. "Anything using it stops working immediately."

## Who can use it

`apikey.read` to see keys and `apikey.manage` to create and revoke them. By default only the
**Owner** role has these.

## Good to know

- A key can never do more than the person who made it can **today**. If their permissions shrink,
  or they leave the organization, the key shrinks or stops with them.
- A key cannot create other keys.
- **Last used** updates at most every five minutes.
- Keys made from this page never expire; revoke them when no longer needed.
