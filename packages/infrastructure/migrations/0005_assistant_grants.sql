-- Hand-written: this is data, not DDL. The seed grants the assistant key on
-- tenants created from here on; this backfills the roles that already exist.
--
-- Selected by what a role holds rather than by its key, so a custom role built from
-- `member` or `admin` gets the same. It answers only from what its asker may read, so
-- whoever reads the docs may ask.
INSERT INTO "role_permissions" ("organization_id", "role_id", "permission")
SELECT r."organization_id", r."id", 'ai.assistant.use'
FROM "roles" r
WHERE EXISTS (
  SELECT 1 FROM "role_permissions" existing
  WHERE existing."role_id" = r."id"
    AND existing."organization_id" = r."organization_id"
    AND existing."permission" = 'doc.page.read'
)
ON CONFLICT DO NOTHING;
