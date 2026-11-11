import { type PushSubscriptionInput, ValidationError } from "../import.js";
import type { UnitOfWork } from "../port/index.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { PushSubscriptionRepository } from "./push-subscription.repository.js";

// This device, for the actor in the active tenant (`26.3`). Refused when the deployment
// has no keys: a row nothing can send to is a row nothing ever cleans up.
export class SubscribePushUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly subscriptions: PushSubscriptionRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly enabled: boolean,
  ) {}

  public async execute(actor: Principal, input: PushSubscriptionInput): Promise<void> {
    this.authorizer.assert(actor, "notification.preference.update");
    if (!this.enabled) throw new ValidationError([{ field: "endpoint", rule: "unsupported" }]);

    await this.unitOfWork.run(() =>
      this.subscriptions.save(actor.organizationId, actor.userId, {
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
      }),
    );
  }
}
