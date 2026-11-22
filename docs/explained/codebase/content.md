---
title: Content
description: Every word users read, in English and Bengali, plus the menu entries.
---

# Content

> Part of the [codebase guide](index.md). Every file below is described in plain words; the [architecture page](../architecture.md) explains how the parts work together.

Every word a user reads, in English and Bengali, split by screen area (namespace) so a page downloads only the text it needs. Also the menu entries, the image references, and the sentence for every error code.

`ContentSource` is the seam a headless CMS could plug into later; today `StaticContentSource` reads the bundled files. Email text is server-only and never reaches a browser.

| | |
|---|---|
| Folder | `packages/content/` |
| Files | 70 |
| Uses | [Assets](asset.md), [Errors](errors.md), [Permissions](permissions.md) |
| Used by | [Application (the business logic)](application.md), [Infrastructure (the real adapters)](infrastructure.md), [Auth](auth.md), [Composition (the wiring)](composition.md), [Feature (the screens' building blocks)](feature.md), [The web app](app-web.md) |

## Every file

### `packages/content/`

| File | What it does |
|---|---|
| `package.json` | Package manifest. |
| `tsconfig.json` | TypeScript settings. |
| `tsup.config.ts` | Build settings. |
| `vitest.config.ts` | Test settings. |

### `packages/content/src/`

| File | What it does |
|---|---|
| `import.ts` | Outside-import surface. |
| `index.ts` | Public entry point. |

### `packages/content/src/collection/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |

### `packages/content/src/collection/nav/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `nav.data.ts` | The main menu entries: each one's module, icon and label key. A menu entry names a module, never a permission, so editing menu content can never widen access. |
| `nav.schema.ts` | The schema a menu entry must match, checked when the module loads. |

### `packages/content/src/media/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `media-ref.ts` | `MediaResolver`: turns an image key such as `brand.logo` into a real URL. A CDN would plug in here. |
| `static-media.resolver.ts` | `StaticMediaResolver`: the default resolver, reading the image manifest the `asset` package builds. |

### `packages/content/src/message/`

| File | What it does |
|---|---|
| `catalog.server.ts` | `SERVER_CATALOG`: the text bundles only the server may load, such as email copy, so they never reach a browser. |
| `catalog.ts` | `CLIENT_CATALOG`: how the browser loads each language's text, one small file per language and screen area, only when a page needs it. |
| `error-copy.ts` | `ERROR_COPY` and `ErrorCopy`: the words shown for every error code and every form validation rule. The only place a failure gets a sentence. |
| `index.ts` | Folder barrel. |
| `namespace.ts` | The text namespaces (`auth`, `doc`, `platform` and so on) and the `MessageKey` type: every text key in the app, so a typo in a key fails to compile. `common`, `error` and `nav` are always loaded; the rest load per page. |

### `packages/content/src/message/bn/`

| File | What it does |
|---|---|
| `account.ts` | Bengali text for managing your own account (profile, email, password, two-factor, sessions). |
| `apikey.ts` | Bengali text for the API keys screen. |
| `auth.ts` | Bengali text for signing up, signing in, two-factor, verifying email and resetting a password. |
| `common.ts` | Bengali text for words every screen shares (loading, empty, save, cancel). |
| `doc.ts` | Bengali text for the docs reader and editor. |
| `document.ts` | Bengali text for AI document search. |
| `email.ts` | Bengali text for every email's subject and body (server-only, never sent to a browser). |
| `error.ts` | Bengali text for the sentence for every error code and form rule. |
| `member.ts` | Bengali text for members and invitations. |
| `nav.ts` | Bengali text for the header, menus and settings sidebar. |
| `notification.ts` | Bengali text for notifications, the inbox and preferences. |
| `organization.ts` | Bengali text for founding an organization and accepting an invitation. |
| `platform.ts` | Bengali text for every super admin screen. |
| `role.ts` | Bengali text for roles and the permission grid. |

### `packages/content/src/message/en/`

| File | What it does |
|---|---|
| `account.ts` | English text for managing your own account (profile, email, password, two-factor, sessions). |
| `apikey.ts` | English text for the API keys screen. |
| `auth.ts` | English text for signing up, signing in, two-factor, verifying email and resetting a password. |
| `common.ts` | English text for words every screen shares (loading, empty, save, cancel). |
| `doc.ts` | English text for the docs reader and editor. |
| `document.ts` | English text for AI document search. |
| `email.ts` | English text for every email's subject and body (server-only, never sent to a browser). |
| `error.ts` | English text for the sentence for every error code and form rule. |
| `member.ts` | English text for members and invitations. |
| `nav.ts` | English text for the header, menus and settings sidebar. |
| `notification.ts` | English text for notifications, the inbox and preferences. |
| `organization.ts` | English text for founding an organization and accepting an invitation. |
| `platform.ts` | English text for every super admin screen. |
| `role.ts` | English text for roles and the permission grid. |

### `packages/content/src/primitive/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `locale.ts` | `Locales`: the supported languages (English, Bengali), each named in its own language, and a safe check for an untrusted locale string. |

### `packages/content/src/source/`

| File | What it does |
|---|---|
| `content-source.ts` | `ContentSource`: the interface any content provider implements (text, images, menu records, long-form content). A headless CMS would plug in here. |
| `index.ts` | Folder barrel. |
| `static-content.source.ts` | `StaticContentSource`: the default provider, reading the bundled text files. |

### `packages/content/src/translator/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `message-store.ts` | `MessageStore`: holds the loaded text for the current language and loads more namespaces as the user navigates. Works without React. |
| `translator.ts` | `Translator` and `MessageSnapshot`: looks up a text key and fills in its `{placeholders}`. The snapshot is also what the server writes into the HTML so the browser starts with the right text. |

### `packages/content/tests/collection/`

| File | What it does |
|---|---|
| `nav.data.spec.ts` | Tests that every menu entry names a real module and carries no permission field. |

### `packages/content/tests/media/`

| File | What it does |
|---|---|
| `static-media.resolver.spec.ts` | Tests `static-media.resolver.ts`. |

### `packages/content/tests/message/`

| File | What it does |
|---|---|
| `error-copy.spec.ts` | Tests `error-copy.ts`. |

### `packages/content/tests/primitive/`

| File | What it does |
|---|---|
| `locale.spec.ts` | Tests `locale.ts`. |

### `packages/content/tests/source/`

| File | What it does |
|---|---|
| `content-source.shapes.spec.ts` | Tests the three content shapes through the provider and translator, including that a missing namespace shows its key rather than failing silently. |
| `static-content.source.spec.ts` | Tests `static-content.source.ts`. |

### `packages/content/tests/translator/`

| File | What it does |
|---|---|
| `message-store.spec.ts` | Tests `message-store.ts`. |
| `translator.spec.ts` | Tests `translator.ts`. |

### `packages/content/docs/`

| File | What it does |
|---|---|
| `index.md` | Every user-visible string, image reference, and structured record, split by locale and namespace so no runtime downloads words it cannot use. Three content shapes, each with a consumer. |
| `meta.json` | Sidebar order. |

### `packages/content/docs/reference/`

| File | What it does |
|---|---|
| `content-shapes.md` | Why media and nav are separate shapes rather than one — and the rule that keeps a content edit from becoming a privilege escalation. |
| `content-source.md` | The abstract seam a CMS slots into, StaticContentSource behind it, and why the shell namespaces are a property of the base class rather than a convention. |
| `error-copy.md` | ERROR_COPY, FIELD_RULE_COPY and ErrorCopy — the only place in the repository where a failure gets words, and the reason @loadbearing/errors has no message field. |
| `meta.json` | Sidebar order. |
| `namespace.md` | The closed MessageKey union derived from type-only imports — how the key guarantee survives splitting the runtime data into one chunk per locale and namespace. |
| `translator.md` | Translator and MessageSnapshot — one immutable shape that is the constructor argument, the SSR wire format, and the merge unit, plus twelve lines of interpolation and no i18n library. |
