import type { PushEndpointInput } from "../import.js";
import type { UnitOfWork } from "../port/index.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { PushSubscriptionRepository } from "./push-subscription.repository.js";

// Only the actor's own row: an endpoint is not a secret, so naming one proves nothing.
export class UnsubscribePushUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly subscriptions: PushSubscriptionRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  public async execute(actor: Principal, input: PushEndpointInput): Promise<void> {
    this.authorizer.assert(actor, "notification.preference.update");
    await this.unitOfWork.run(() =>
      this.subscriptions.delete(actor.organizationId, input.endpoint, actor.userId),
    );
  }
}
