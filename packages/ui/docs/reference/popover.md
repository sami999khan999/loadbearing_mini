---
title: Popover
description: A panel anchored to the control that opened it, on Base UI — what it keeps from the hand-rolled version, what it deliberately is not, and the two behaviours that changed.
---

# Popover

```tsx
<Popover label="Notifications" trigger={<Icon name="bell" />}>
  <NotificationPeek href="/notifications" />
</Popover>
```

One string names button and panel, so assistive tech hears one thing. The trigger is `ghost` by default
(an icon in a bar); `variant="secondary"` suits a row of bordered buttons (the doc reader's Open menu).
It is Base UI's `Popover` with kit styles; Base UI owns Escape, outside-press dismissal, focus in and
out, and `aria-expanded`/`aria-controls`.

## The panel is unmounted, not hidden

Every real panel is a query; hidden, a header-bar panel would fetch on every page. Closed means absent,
so `aria-controls` is too (pointing at a missing id is worse). Base UI's default — never pass
`keepMounted`.

## What changed with Base UI

- **Focus moves into the panel**, and Escape returns it to the trigger a tick after close (the spec
  waits) — otherwise focus lands on `body` and Tab restarts at the top.
- **It portals to `body`** — no `overflow: hidden` clipping, positioned by Base UI. It also leaves any
  nested `data-theme`, so one inside the doc reader's scoped theme would paint the page theme (none does).
- **An outside press dismisses on click**, not `pointerdown`; a spec drives a whole press.

## What it is not

- **Not a menu** — no roving focus, arrow keys or `role="menu"`; a `dialog` of ordinary content.
- **Not modal** — Tab leaves the panel and the page stays live; traps belong to `Dialog`.
