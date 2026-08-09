-- Drop four models that were defined in the schema but never implemented:
-- no service code, no controller, no UI, and zero rows in every environment
-- checked. Keeping them made the schema overstate what the product does.
--
--   MessageTemplate  - canned '/shortcut' replies, never built
--   Report           - moderation reporting, never built
--   GroupInvite      - invite/approval flow, never built (Group.inviteToken
--                      and Group.requiresApproval remain and are untouched)
--   FilePermission   - per-file access rules, never built; file access is
--                      enforced by conversation membership instead
--
-- Written by hand rather than generated: `prisma migrate dev` insists on a
-- full database reset because of pre-existing drift in Group and
-- WorkspaceUser, and a reset would destroy workspace data.

PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS "MessageTemplate";
DROP TABLE IF EXISTS "Report";
DROP TABLE IF EXISTS "GroupInvite";
DROP TABLE IF EXISTS "FilePermission";

PRAGMA foreign_keys=ON;
