import { ConflictError, NotFoundError, type RoleId } from "../import.js";
import type { ActivityLogger, UnitOfWork } from "../port/index.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { RoleRepository } from "./role.repository.js";
import { RoleRules } from "./role.rules.js";

export interface DeleteRoleInput {
  readonly roleId: RoleId;
}

export class DeleteRoleUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly roles: RoleRepository,
    private readonly activity: ActivityLogger,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  public async execute(actor: Principal, input: DeleteRoleInput): Promise<void> {
    this.authorizer.assert(actor, "rbac.role.manage");

    const role = await this.roles.findById(actor.organizationId, input.roleId);
    if (!role) throw new NotFoundError("role", input.roleId);
    RoleRules.assertEditable(role);

    // Counted and deleted in one transaction. Checked rather than left to the `no action`
    // foreign keys, whose alternative is a driver error.
    await this.unitOfWork.run(async () => {
      const held = await this.roles.countAssignments(actor.organizationId, role.id);
      if (held > 0) throw new ConflictError("role", "inUse");

      await this.roles.delete(actor.organizationId, role.id);
      await this.activity.record(actor, "role.deleted", { roleId: role.id, key: role.key });
    });
  }
}
