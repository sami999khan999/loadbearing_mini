import type { DomainEvent, MailTemplateKey, RealtimeMessage } from "@loadbearing/contracts";
import { Identifiers } from "@loadbearing/contracts";
import { CapabilitySet } from "@loadbearing/permissions";
import { beforeEach, describe, expect, it } from "vitest";
import { DeliverNotificationUseCase } from "../../src/notification/deliver-notification.use-case.js";
import type {
  NewNotification,
  NotificationPage,
  NotificationRecord,
  NotificationRepository,
} from "../../src/notification/notification.repository.js";
import type {
  NotificationPreferenceRepository,
  PreferenceRecord,
} from "../../src/notification/notification-preference.repository.js";
import type {
  NotificationRecipientReader,
  Recipient,
} from "../../src/notification/notification-recipient.reader.js";
import type {
  CacheStore,
  MailPublisher,
  MailRequest,
  PushPayload,
  RealtimePublisher,
} from "../../src/port/index.js";
import { Principal, type RealtimeChannel } from "../../src/primitive/index.js";

const ORG = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const ACTOR = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");
const TARGET = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000012");
const ROLE = Identifiers.roleId.parse("018f8c00-0000-7000-8000-000000000013");

const recipient = (userId: typeof TARGET): Recipient => ({
  userId,
  email: `${userId}@example.test`,
  name: "Ada",
  locale: "en",
});

// Deduplicates on `(eventId, userId, kind)` exactly as the unique index does, so a
// replayed event reports nothing new and the caller sends nothing.
class Notifications implements NotificationRepository {
  public readonly saved: NewNotification[] = [];

  public list(): Promise<NotificationPage> {
    return Promise.resolve({ items: [], nextCursor: null });
  }

  public countUnread(): Promise<number> {
    return Promise.resolve(0);
  }

  // False by default: every existing spec here delivers a `membership` row, and those
  // declare no subject, so suppression never runs for them.
  public unreadSubjects: readonly string[] = [];

  public suppressionQueries = 0;

  public readonly counted: { userIds: readonly string[]; subjectId: string; eventId: string }[] =
    [];

  public countIntoUnread(
    _organizationId: unknown,
    userIds: readonly string[],
    _kind: unknown,
    subjectId: string,
    eventId: string,
  ): Promise<void> {
    if (userIds.length > 0) this.counted.push({ userIds, subjectId, eventId });
    return Promise.resolve();
  }

  public unreadSubjectHolders(
    _organizationId: unknown,
    userIds: readonly (typeof TARGET)[],
    _kind: unknown,
    subjectId: string,
  ): Promise<ReadonlySet<typeof TARGET>> {
    this.suppressionQueries += 1;
    return Promise.resolve(new Set(this.unreadSubjects.includes(subjectId) ? userIds : []));
  }

  public saveMany(records: readonly NewNotification[]): Promise<readonly (typeof TARGET)[]> {
    const fresh = records.filter(
      (record) =>
        !this.saved.some(
          (existing) =>
            existing.eventId === record.eventId &&
            existing.userId === record.userId &&
            existing.kind === record.kind,
        ),
    );
    this.saved.push(...fresh);
    return Promise.resolve(fresh.map((record) => record.userId));
  }

  public markRead(): Promise<void> {
    return Promise.resolve();
  }

  public markAllRead(): Promise<void> {
    return Promise.resolve();
  }

  public listUnreadBetween(): Promise<ReadonlyMap<typeof TARGET, readonly NotificationRecord[]>> {
    return Promise.resolve(new Map());
  }

  public recipientsWithUnreadBetween(): Promise<readonly never[]> {
    return Promise.resolve([]);
  }
}

class Preferences implements NotificationPreferenceRepository {
  public constructor(private readonly stored: readonly PreferenceRecord[] = []) {}

  public findFor(): Promise<readonly PreferenceRecord[]> {
    return Promise.resolve(this.stored);
  }

  public listFor(): Promise<readonly PreferenceRecord[]> {
    return Promise.resolve(this.stored);
  }

  public save(): Promise<void> {
    return Promise.resolve();
  }

  public organizationsWithDigest(): Promise<readonly (typeof ORG)[]> {
    return Promise.resolve([]);
  }

  public digestRecipients(): Promise<readonly (typeof TARGET)[]> {
    return Promise.resolve([]);
  }
}

class Recipients implements NotificationRecipientReader {
  public constructor(private readonly members: readonly Recipient[] = []) {}

  public organizationMembers(): Promise<readonly Recipient[]> {
    return Promise.resolve(this.members);
  }

  public user(): Promise<Recipient | null> {
    return Promise.resolve(recipient(TARGET));
  }

  public users(): Promise<readonly Recipient[]> {
    return Promise.resolve(this.members);
  }

  public conversationMembersAmong(
    _organizationId: unknown,
    _conversationId: unknown,
    userIds: readonly string[],
  ): Promise<readonly Recipient[]> {
    return Promise.resolve(
      (this as unknown as { members?: readonly Recipient[] }).members?.filter((member) =>
        userIds.includes(member.userId),
      ) ?? [],
    );
  }

  public conversationMembers(): Promise<readonly Recipient[]> {
    return Promise.resolve(this.members);
  }
}

class Mail implements MailPublisher {
  public readonly published: MailRequest<MailTemplateKey>[] = [];

  public publish<K extends MailTemplateKey>(mail: MailRequest<K>): Promise<void> {
    this.published.push(mail as MailRequest<MailTemplateKey>);
    return Promise.resolve();
  }

  public publishMany(mails: readonly MailRequest[]): Promise<void> {
    this.published.push(...(mails as MailRequest<MailTemplateKey>[]));
    return Promise.resolve();
  }
}

class Realtime implements RealtimePublisher {
  public readonly frames: { channel: string; message: RealtimeMessage }[] = [];

  public publish(channel: RealtimeChannel, message: RealtimeMessage): Promise<void> {
    this.frames.push({ channel, message });
    return Promise.resolve();
  }
}

class Cache implements CacheStore {
  public readonly deleted: string[] = [];

  public get<T>(): Promise<T | null> {
    return Promise.resolve(null);
  }

  public set(): Promise<void> {
    return Promise.resolve();
  }

  public setIfAbsent(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public delete(key: string): Promise<void> {
    this.deleted.push(key);
    return Promise.resolve();
  }

  public deletePrefix(): Promise<void> {
    return Promise.resolve();
  }
}

const roleChanged = (): DomainEvent =>
  ({
    id: "018f8c00-0000-7000-8000-000000000020",
    organizationId: ORG,
    name: "member.role.changed",
    actorId: ACTOR,
    occurredAt: new Date("2026-08-15T00:00:00Z"),
    payload: { userId: TARGET, roleId: ROLE, previousRoleId: ROLE },
  }) as DomainEvent;

const joined = (): DomainEvent =>
  ({
    id: "018f8c00-0000-7000-8000-000000000021",
    organizationId: ORG,
    name: "member.joined",
    actorId: ACTOR,
    occurredAt: new Date("2026-08-15T00:00:00Z"),
    payload: { userId: TARGET, roleId: ROLE },
  }) as DomainEvent;

const system = () => Principal.system(ORG, ACTOR, CapabilitySet.empty());

let notifications: Notifications;
let mail: Mail;
let realtime: Realtime;
let cache: Cache;

const build = (
  preferences: readonly PreferenceRecord[] = [],
  members: readonly Recipient[] = [],
) => {
  notifications = new Notifications();
  mail = new Mail();
  realtime = new Realtime();
  cache = new Cache();

  return new DeliverNotificationUseCase(
    notifications,
    new Preferences(preferences),
    new Recipients(members),
    mail,
    realtime,
    cache,
    { run: (work: () => Promise<unknown>) => work() } as never,
  );
};

beforeEach(() => {
  notifications = new Notifications();
});

describe("DeliverNotificationUseCase", () => {
  const channelMessage = (mentions: readonly string[]) =>
    ({
      id: "018f8c00-0000-7000-8000-000000000023",
      organizationId: ORG,
      name: "message.sent",
      actorId: ACTOR,
      occurredAt: new Date("2026-08-15T00:00:00Z"),
      payload: {
        conversationId: "018f8c00-0000-7000-8000-0000000000c2",
        messageId: "018f8c00-0000-7000-8000-0000000000d2",
        conversationKind: "channel",
        mentions,
      },
    }) as unknown as DomainEvent;

  // `26.7`: a channel message notifies nobody, unless it names people in the room.
  it("notifies the members a channel message mentions, and only them", async () => {
    const deliver = build([], [recipient(TARGET)]);

    await deliver.execute(system(), channelMessage([TARGET]));

    expect(notifications.saved).toHaveLength(1);
    expect(notifications.saved[0]).toMatchObject({ userId: TARGET, kind: "message.mentioned" });
  });

  it("notifies nobody for a mention of someone outside the room, or no mention at all", async () => {
    const deliver = build([], [recipient(TARGET)]);

    await deliver.execute(system(), channelMessage(["018f8c00-0000-7000-8000-0000000000ee"]));
    await deliver.execute(system(), channelMessage([]));

    expect(notifications.saved).toHaveLength(0);
  });

  // `26.7`: a reader with an unread item about this conversation gets it counted, not a
  // second item, and someone without one gets a fresh row.
  it("counts a direct message into the reader's unread item instead of writing another", async () => {
    const deliver = build([], [recipient(TARGET)]);
    notifications.unreadSubjects = ["018f8c00-0000-7000-8000-0000000000c1"];

    await deliver.execute(system(), {
      id: "018f8c00-0000-7000-8000-000000000022",
      organizationId: ORG,
      name: "message.sent",
      actorId: ACTOR,
      occurredAt: new Date("2026-08-15T00:00:00Z"),
      payload: {
        conversationId: "018f8c00-0000-7000-8000-0000000000c1",
        messageId: "018f8c00-0000-7000-8000-0000000000d1",
        conversationKind: "direct",
      },
    } as unknown as DomainEvent);

    expect(notifications.saved).toHaveLength(0);
    expect(notifications.counted).toEqual([
      {
        userIds: [TARGET],
        subjectId: "018f8c00-0000-7000-8000-0000000000c1",
        eventId: "018f8c00-0000-7000-8000-000000000022",
      },
    ]);
  });

  it("writes one row for the member a role change was about", async () => {
    const deliver = build();

    await deliver.execute(system(), roleChanged());

    expect(notifications.saved).toHaveLength(1);
    expect(notifications.saved[0]).toMatchObject({ userId: TARGET, kind: "member.role.changed" });
  });

  // Delivery is at-least-once: the unique index keeps the row single, and the mail carries
  // the same dedupe key so the queue drops the repeat.
  it("writes one row when the same event is handled twice", async () => {
    const deliver = build();

    await deliver.execute(system(), roleChanged());
    await deliver.execute(system(), roleChanged());

    expect(notifications.saved).toHaveLength(1);
    expect(new Set(mail.published.map((m) => m.dedupeKey)).size).toBe(1);
  });

  // The rows committed and the publish after them failed: the retry finds nothing new to
  // write and must still tell the recipient.
  it("sends the mail and the frame on a retry after the rows were written", async () => {
    const deliver = build();
    await deliver.execute(system(), roleChanged());
    mail.published.length = 0;
    realtime.frames.length = 0;

    await deliver.execute(system(), roleChanged());

    expect(mail.published).toHaveLength(1);
    expect(realtime.frames).toHaveLength(1);
  });

  // Being told about a thing you just did is noise, and it is the single most common
  // reason a notification system gets muted.
  it("never notifies the actor about their own action", async () => {
    const deliver = build([], [recipient(ACTOR), recipient(TARGET)]);

    await deliver.execute(system(), joined());

    expect(notifications.saved.map((row) => row.userId)).toEqual([TARGET]);
  });

  // `member.invited` has a policy row whose recipients are `none`: the invitee has no
  // account, so there is no inbox to write to.
  it("writes nothing for an event whose recipients are none", async () => {
    const deliver = build();

    await deliver.execute(system(), { ...roleChanged(), name: "member.invited" } as DomainEvent);

    expect(notifications.saved).toEqual([]);
  });

  it("emails an immediate recipient and dedupes on the event", async () => {
    const deliver = build();

    await deliver.execute(system(), roleChanged());

    expect(mail.published).toHaveLength(1);
    expect(mail.published[0]).toMatchObject({
      template: "notification.single",
      dedupeKey: `notification_018f8c00-0000-7000-8000-000000000020_${TARGET}`,
    });
  });

  // `digest` means "collect these", not "send now". The daily schedule picks them up.
  it("sends no mail to a digest recipient", async () => {
    const deliver = build([
      { userId: TARGET, category: "membership", channel: "email", mode: "digest" },
    ]);

    await deliver.execute(system(), roleChanged());

    expect(notifications.saved).toHaveLength(1);
    expect(mail.published).toEqual([]);
  });

  // `off` on the in-app channel silences the frame, not the row: the inbox still has it,
  // and the person simply is not interrupted.
  it("still writes the row when in-app is off", async () => {
    const deliver = build([
      { userId: TARGET, category: "membership", channel: "in_app", mode: "off" },
    ]);

    await deliver.execute(system(), roleChanged());

    expect(notifications.saved).toHaveLength(1);
    expect(realtime.frames).toEqual([]);
  });

  it("publishes the frame on the recipient's own channel and carries no row data", async () => {
    const deliver = build();

    await deliver.execute(system(), roleChanged());

    expect(realtime.frames[0]?.channel).toBe(`org:${ORG}:user:${TARGET}`);
    expect(realtime.frames[0]?.message).toMatchObject({ name: "notification.created" });
  });

  // The badge is read-through cached, so a delivery that did not invalidate would leave
  // the recipient's count a minute behind the row they can already see.
  it("invalidates the recipient's unread count", async () => {
    const deliver = build();

    await deliver.execute(system(), roleChanged());

    expect(cache.deleted).toContain(`notification:unread:${ORG}:${TARGET}`);
  });
});

// `26.3`: push is a third channel, `immediate` or `off`, sent to every device a person
// subscribed, at most once per event per device, and a device the service retired is dropped.
describe("DeliverNotificationUseCase, push", () => {
  const pushOn: PreferenceRecord = {
    userId: TARGET,
    category: "membership",
    channel: "push",
    mode: "immediate",
  };

  const withPush = (
    preferences: readonly PreferenceRecord[],
    outcome: "sent" | "gone",
    claimed = true,
  ) => {
    const sent: { endpoint: string; payload: PushPayload }[] = [];
    const deleted: (string | null)[] = [];
    const pushCache = new Cache();
    pushCache.setIfAbsent = () => Promise.resolve(claimed);
    const useCase = new DeliverNotificationUseCase(
      new Notifications(),
      new Preferences(preferences),
      new Recipients(),
      new Mail(),
      new Realtime(),
      pushCache,
      { run: (work: () => Promise<unknown>) => work() } as never,
      {
        subscriptions: {
          forUsers: () =>
            Promise.resolve([
              { userId: TARGET, endpoint: "https://push.test/a", p256dh: "k", auth: "a" },
            ]),
          delete: (_org: unknown, endpoint: string, userId: string | null) => {
            deleted.push(userId === null ? endpoint : null);
            return Promise.resolve();
          },
        } as never,
        sender: {
          send: (target: { endpoint: string }, payload: PushPayload) => {
            sent.push({ endpoint: target.endpoint, payload });
            return Promise.resolve(outcome);
          },
        } as never,
      },
    );
    return { useCase, sent, deleted };
  };

  it("pushes the kind and its link, in the recipient's locale, when push is on", async () => {
    const { useCase, sent } = withPush([pushOn], "sent");

    await useCase.execute(system(), roleChanged());

    expect(sent).toEqual([
      {
        endpoint: "https://push.test/a",
        payload: { kind: "member.role.changed", link: "/settings/members", locale: "en" },
      },
    ]);
  });

  // Membership's default for push is off: a role change pushes nothing until chosen.
  it("pushes nothing at the default for membership", async () => {
    const { useCase, sent } = withPush([], "sent");

    await useCase.execute(system(), roleChanged());

    expect(sent).toEqual([]);
  });

  it("sends a redelivered event to no device twice", async () => {
    const { useCase, sent } = withPush([pushOn], "sent", false);

    await useCase.execute(system(), roleChanged());

    expect(sent).toEqual([]);
  });

  it("deletes a subscription the push service says is gone", async () => {
    const { useCase, deleted } = withPush([pushOn], "gone");

    await useCase.execute(system(), roleChanged());

    expect(deleted).toEqual(["https://push.test/a"]);
  });
});
