-- Hand-written: this is data, not DDL. The seed grants the messaging keys on tenants
-- created from here on; this backfills the roles that already exist.
--
-- Selected by what a role holds rather than by its key, so a custom role built from
-- `member` or `admin` gets the same: whoever reads the member list may talk to it.
INSERT INTO "role_permissions" ("organization_id", "role_id", "permission")
SELECT r."organization_id", r."id", k.permission
FROM "roles" r
CROSS JOIN (VALUES
  ('messaging.conversation.read'),
  ('messaging.conversation.create'),
  ('messaging.message.send'),
  ('messaging.message.update')
) AS k(permission)
WHERE EXISTS (
  SELECT 1 FROM "role_permissions" existing
  WHERE existing."role_id" = r."id"
    AND existing."organization_id" = r."organization_id"
    AND existing."permission" = 'member.read'
)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Managing a room (members, names) is an administrator's, as inviting is.
INSERT INTO "role_permissions" ("organization_id", "role_id", "permission")
SELECT r."organization_id", r."id", 'messaging.conversation.manage'
FROM "roles" r
WHERE EXISTS (
  SELECT 1 FROM "role_permissions" existing
  WHERE existing."role_id" = r."id"
    AND existing."organization_id" = r."organization_id"
    AND existing."permission" = 'member.invite'
)
ON CONFLICT DO NOTHING;
