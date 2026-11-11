import type { Authorizer, Principal } from "../primitive/index.js";

// The VAPID public key, or null when this deployment sends no push (`26.3`).
export class GetPushKeyUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly publicKey: string | null,
  ) {}

  public execute(actor: Principal): { readonly publicKey: string | null } {
    this.authorizer.assert(actor, "notification.inbox.read");
    return { publicKey: this.publicKey };
  }
}
