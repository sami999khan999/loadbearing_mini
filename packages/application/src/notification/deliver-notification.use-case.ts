import {
  type ConversationId,
  type DomainEvent,
  type NotificationChannel,
  type NotificationMode,
  type UserId,
  Uuid,
} from "../import.js";
import type {
  CacheStore,
  MailPublisher,
  PushSender,
  RealtimePublisher,
  UnitOfWork,
} from "../port/index.js";
import { type Principal, RealtimeChannels } from "../primitive/index.js";
import { CountUnreadNotificationsUseCase } from "./count-unread-notifications.use-case.js";
import { NotificationPolicy, type PolicyRow } from "./notification.policy.js";
import type { NewNotification, NotificationRepository } from "./notification.repository.js";
import type {
  NotificationPreferenceRepository,
  PreferenceRecord,
} from "./notification-preference.repository.js";
import type { NotificationRecipientReader, Recipient } from "./notification-recipient.reader.js";
import type { PushSubscriptionRepository } from "./push-subscription.repository.js";

// One page of recipients, and §6's fan-out is measured rather than trusted now — see
// `packages/infrastructure/docs/reference/fan-out.md`.
const RECIPIENT_LIMIT = 500;

// How many recipients are notified together. The cap above is the ceiling on the whole
// audience, so one chunk is usually the whole of it.
const NOTIFY_CHUNK = 100;

// How long a push is remembered as sent, so a redelivered event alerts nobody twice.
const PUSH_DEDUPE_SECONDS = 86_400;

// What the subscriber hands in: the event, nothing else. It asserts no permission —
// see docs/reference/ports.md.
export class DeliverNotificationUseCase {
  public constructor(
    private readonly notifications: NotificationRepository,
    private readonly preferences: NotificationPreferenceRepository,
    private readonly recipients: NotificationRecipientReader,
    private readonly mail: MailPublisher,
    private readonly realtime: RealtimePublisher,
    private readonly cache: CacheStore,
    private readonly unitOfWork: UnitOfWork,
    // Absent when the deployment has no VAPID keys; `push` preferences then reach nobody.
    private readonly push: {
      readonly subscriptions: PushSubscriptionRepository;
      readonly sender: PushSender;
    } | null = null,
  ) {}

  public async execute(actor: Principal, event: DomainEvent): Promise<void> {
    // A message in a channel matches its name and still produces nothing, unless it
    // names people: then it is a mention, delivered to them alone (`26.7`).
    const row = NotificationPolicy.rowForEvent(event);
    if (!row) return;

    const audience = await this.suppressed(event, await this.audienceFor(event, row), row);
    if (audience.length === 0) return;

    // One statement for N recipients, idempotent on `(event_id, user_id, kind)`. Everything
    // after it runs on every attempt, because a publish can fail after the commit.
    // ──
    // In a unit of work because it is routed and this is the job `24.2b`'s recheck was
    // built for: the freeze and the recheck both live in `run` (`CR.11`).
    await this.unitOfWork.run(() =>
      this.notifications.saveMany(
        audience.map((recipient) => DeliverNotificationUseCase.rowFor(event, row, recipient)),
      ),
    );

    const modes = await this.preferences.findFor(
      event.organizationId,
      audience.map((recipient) => recipient.userId),
      row.category,
    );

    // Mail is deduped on the event and the recipient, so the repeat costs a frame at most.
    await this.notifyInApp(event, audience, modes, row);
    await this.notifyByEmail(event, audience, modes, row);
    await this.notifyByPush(event, audience, modes, row);
    void actor;
  }

  private async audienceFor(event: DomainEvent, row: PolicyRow): Promise<readonly Recipient[]> {
    const organizationId = event.organizationId;

    switch (row.recipients.kind) {
      case "none":
        return [];
      case "subject": {
        const subject = DeliverNotificationUseCase.subjectOf(event);
        if (!subject) return [];
        const recipient = await this.recipients.user(organizationId, subject);
        return recipient ? [recipient] : [];
      }
      case "conversationMembers": {
        const conversationId = DeliverNotificationUseCase.conversationOf(event);
        if (!conversationId) return [];

        const all = await this.recipients.conversationMembers(
          organizationId,
          conversationId,
          RECIPIENT_LIMIT,
        );
        return all.filter((recipient) => recipient.userId !== event.actorId);
      }
      case "mentionedMembers": {
        const conversationId = DeliverNotificationUseCase.conversationOf(event);
        const named = NotificationPolicy.mentions(event) as readonly UserId[];
        if (!conversationId || named.length === 0) return [];

        const members = await this.recipients.conversationMembersAmong(
          organizationId,
          conversationId,
          named,
        );
        return members.filter((recipient) => recipient.userId !== event.actorId);
      }
      case "organizationMembers": {
        const all = await this.recipients.organizationMembers(
          organizationId,
          row.recipients.holding,
          RECIPIENT_LIMIT,
          null,
        );
        // Never the actor: being told about a thing you just did is noise, and it is the
        // single most common reason a notification system gets muted.
        return all.filter((recipient) => recipient.userId !== event.actorId);
      }
    }
  }

  // Drops anyone who already has an unread one about this subject, in one query for the
  // whole audience — a channel message used to ask once per member, up to five hundred.
  private async suppressed(
    event: DomainEvent,
    audience: readonly Recipient[],
    row: PolicyRow,
  ): Promise<readonly Recipient[]> {
    const subjectId = NotificationPolicy.subjectOf(event);
    if (!subjectId || audience.length === 0) return audience;

    const holding = await this.notifications.unreadSubjectHolders(
      event.organizationId,
      audience.map((recipient) => recipient.userId),
      row.kind,
      subjectId,
      event.id,
    );

    // Grouped rather than dropped (`26.7`): the bell keeps one item, and it counts.
    await this.notifications.countIntoUnread(
      event.organizationId,
      [...holding],
      row.kind,
      subjectId,
      event.id,
    );
    return audience.filter((recipient) => !holding.has(recipient.userId));
  }

  private static conversationOf(event: DomainEvent): ConversationId | null {
    return "conversationId" in event.payload ? event.payload.conversationId : null;
  }

  // Best effort, and after the row is written: a failed publish is a missing frame, and
  // the client refetches. A failed *row* would be a missing notification.
  private async notifyInApp(
    event: DomainEvent,
    recipients: readonly Recipient[],
    modes: readonly PreferenceRecord[],
    row: PolicyRow,
  ): Promise<void> {
    // Two Redis round trips a recipient, issued together rather than one at a time. One
    // at a time measured 0.78 ms each at 25 000 — infrastructure fan-out.md.
    for (let index = 0; index < recipients.length; index += NOTIFY_CHUNK) {
      await Promise.all(
        recipients.slice(index, index + NOTIFY_CHUNK).map(async (recipient) => {
          await this.cache.delete(
            CountUnreadNotificationsUseCase.key(event.organizationId, recipient.userId),
          );

          const mode = DeliverNotificationUseCase.modeFor(modes, recipient.userId, "in_app", event);
          if (mode === "off") return;

          await this.realtime.publish(
            RealtimeChannels.user(event.organizationId, recipient.userId),
            {
              kind: "event",
              id: Uuid.v7(),
              name: "notification.created",
              at: event.occurredAt,
              payload: { kind: row.kind },
            },
          );
        }),
      );
    }
  }

  // `immediate` only. `digest` recipients are collected by the daily schedule, and `off`
  // means in-app only rather than nothing at all. One batch for the lot.
  private async notifyByEmail(
    event: DomainEvent,
    recipients: readonly Recipient[],
    modes: readonly PreferenceRecord[],
    row: PolicyRow,
  ): Promise<void> {
    const mails = recipients
      .filter(
        (recipient) =>
          DeliverNotificationUseCase.modeFor(modes, recipient.userId, "email", event) ===
          "immediate",
      )
      .map((recipient) => ({
        template: "notification.single" as const,
        to: recipient.email,
        locale: recipient.locale,
        params: { kind: row.kind, name: recipient.name, url: row.link(event) ?? "" },
        organizationId: event.organizationId,
        userId: recipient.userId,
        // The row's own id would do, but the event id plus the recipient is what makes a
        // replayed event send one message rather than two.
        dedupeKey: `notification_${event.id}_${recipient.userId}`,
      }));

    if (mails.length > 0) await this.mail.publishMany(mails);
  }

  // Best effort, like the frame: a push that fails is an alert missed, and the bell still
  // has the row. One read for the audience's devices, and a dead one is deleted.
  private async notifyByPush(
    event: DomainEvent,
    recipients: readonly Recipient[],
    modes: readonly PreferenceRecord[],
    row: PolicyRow,
  ): Promise<void> {
    if (!this.push) return;
    const push = this.push;
    const wanting = new Map(
      recipients
        .filter(
          (recipient) =>
            DeliverNotificationUseCase.modeFor(modes, recipient.userId, "push", event) ===
            "immediate",
        )
        .map((recipient) => [recipient.userId, recipient.locale] as const),
    );
    if (wanting.size === 0) return;

    const targets = await push.subscriptions.forUsers(event.organizationId, [...wanting.keys()]);
    const link = row.link(event);
    for (let index = 0; index < targets.length; index += NOTIFY_CHUNK) {
      await Promise.all(
        targets.slice(index, index + NOTIFY_CHUNK).map(async (target) => {
          const first = await this.cache.setIfAbsent(
            `notification:push:${event.id}:${target.endpoint}`,
            true,
            PUSH_DEDUPE_SECONDS,
          );
          if (!first) return;
          const locale = wanting.get(target.userId) ?? "en";
          const outcome = await push.sender
            .send(target, { kind: row.kind, link, locale })
            .catch(() => "failed" as const);
          if (outcome === "gone") {
            await push.subscriptions.delete(event.organizationId, target.endpoint, null);
          }
        }),
      );
    }
  }

  private static modeFor(
    modes: readonly PreferenceRecord[],
    userId: UserId,
    channel: NotificationChannel,
    event: DomainEvent,
  ): NotificationMode {
    const stored = modes.find((mode) => mode.userId === userId && mode.channel === channel);
    return stored?.mode ?? NotificationPolicy.defaultMode(event.name, channel);
  }

  private static rowFor(event: DomainEvent, row: PolicyRow, to: Recipient): NewNotification {
    return {
      organizationId: event.organizationId,
      userId: to.userId,
      eventId: event.id,
      kind: row.kind,
      category: row.category,
      // The values the copy interpolates, never the row. A snapshot here would be read
      // by somebody who was never authorised for the thing it describes.
      params: { actorId: event.actorId },
      link: row.link(event),
      subjectId: NotificationPolicy.subjectOf(event),
      // The event's own instant. It is half the dedupe key, so a redelivery must compute
      // the same one — and a notification is about when the thing happened anyway.
      createdAt: event.occurredAt,
    };
  }

  // Named positively rather than by exclusion. The event union has grown past the three
  // this policy knows, and an `!== "member.invited"` test would read a field off the rest.
  private static subjectOf(event: DomainEvent): UserId | null {
    if (event.name === "member.joined" || event.name === "member.role.changed") {
      return event.payload.userId;
    }

    return null;
  }
}
