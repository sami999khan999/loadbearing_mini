import { ApiKeyRouter } from "./api-key.router.js";
import { DocGrantRouter } from "./doc-grant.router.js";
import { DocPageRouter } from "./doc-page.router.js";
import { DocSpaceRouter } from "./doc-space.router.js";
import { DocumentRouter } from "./document.router.js";
import { MemberRouter } from "./member.router.js";
import { NotificationRouter } from "./notification.router.js";
import { OverrideRouter } from "./override.router.js";
import { PlatformRouter } from "./platform.router.js";
import { RoleRouter } from "./role.router.js";

// What `/api/rpc` serves: `contract` from `@loadbearing/contracts` less `realtime`, which
// `apps/realtime` serves. One line per slice: `task: TaskRouter.all`.
export const appRouter = {
  role: RoleRouter.all,
  member: MemberRouter.all,
  apiKey: ApiKeyRouter.all,
  document: DocumentRouter.all,
  notification: NotificationRouter.all,
  platform: PlatformRouter.all,
  override: OverrideRouter.all,
  docSpace: DocSpaceRouter.all,
  docPage: DocPageRouter.all,
  docGrant: DocGrantRouter.all,
};
