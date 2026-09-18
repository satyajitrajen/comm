/**
 * One-off data migration: SQLite -> PostgreSQL.
 *
 * Run ONCE per environment while the old SQLite database still holds the
 * production data, BEFORE switching traffic to the Postgres-backed backend:
 *
 *   1. Generate the legacy client once:
 *        npx prisma generate --schema prisma/schema.sqlite-legacy.prisma
 *   2. Point DATABASE_URL at the new Postgres database (prisma migrate deploy
 *      must already have created the schema there).
 *   3. Run:
 *        SQLITE_URL="file:/var/lib/teamtime/dev.db" \
 *        DATABASE_URL="postgresql://teamtime:...@postgres:5432/teamtime?schema=public" \
 *        npx ts-node prisma/migrate-sqlite-data.ts
 *
 * Rows keep their original UUIDs, so client-side references stay valid. The
 * copy is insert-only (skipDuplicates): re-running on a partially filled
 * database is safe. Verify row counts in the output before decommissioning
 * the SQLite file.
 *
 * Note: the legacy client import is a runtime require because the module only
 * exists after step 1 — this file is intentionally NOT part of the build.
 */
import { PrismaClient as PgClient } from '@prisma/client';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient: SqliteClient } = require('./generated/prisma-sqlite');

const pg = new PgClient();

/** Models in FK-dependency order (parents before children). */
const PLAN: { model: string; table: string }[] = [
  { model: 'workspace', table: 'Workspace' },
  { model: 'user', table: 'User' },
  { model: 'userProfile', table: 'UserProfile' },
  { model: 'workspaceUser', table: 'WorkspaceUser' },
  { model: 'conversation', table: 'Conversation' },
  { model: 'group', table: 'Group' },
  { model: 'groupMember', table: 'GroupMember' },
  { model: 'conversationParticipant', table: 'ConversationParticipant' },
  { model: 'announcementPublisher', table: 'AnnouncementPublisher' },
  { model: 'message', table: 'Message' },
  { model: 'messageEdit', table: 'MessageEdit' },
  { model: 'messageRead', table: 'MessageRead' },
  { model: 'messageDelivery', table: 'MessageDelivery' },
  { model: 'messageReaction', table: 'MessageReaction' },
  // File must precede MessageAttachment (MessageAttachment.fileId -> File.id)
  { model: 'file', table: 'File' },
  { model: 'messageAttachment', table: 'MessageAttachment' },
  { model: 'messageDeletion', table: 'MessageDeletion' },
  { model: 'pinnedMessage', table: 'PinnedMessage' },
  { model: 'starredMessage', table: 'StarredMessage' },
  { model: 'poll', table: 'Poll' },
  { model: 'pollOption', table: 'PollOption' },
  { model: 'pollVote', table: 'PollVote' },
  { model: 'task', table: 'Task' },
  { model: 'taskAssignee', table: 'TaskAssignee' },
  { model: 'calendarEvent', table: 'CalendarEvent' },
  { model: 'eventAttendee', table: 'EventAttendee' },
  { model: 'appIntegration', table: 'AppIntegration' },
  { model: 'loginSession', table: 'LoginSession' },
  { model: 'otpChallenge', table: 'OtpChallenge' },
  { model: 'passwordResetToken', table: 'PasswordResetToken' },
  { model: 'device', table: 'Device' },
  { model: 'notification', table: 'Notification' },
  { model: 'auditLog', table: 'AuditLog' },
  { model: 'blockedUser', table: 'BlockedUser' },
  { model: 'mutedChat', table: 'MutedChat' },
  { model: 'archivedChat', table: 'ArchivedChat' },
  { model: 'setting', table: 'Setting' },
];

async function main() {
  const sqlite = new SqliteClient({
    datasources: { db: { url: process.env.SQLITE_URL ?? 'file:./dev.db' } },
  });
  const legacy = sqlite as unknown as Record<
    string,
    { findMany: () => Promise<Record<string, unknown>[]> }
  >;
  const target = pg as unknown as Record<
    string,
    {
      createMany: (a: {
        data: unknown[];
        skipDuplicates: boolean;
      }) => Promise<{ count: number }>;
    }
  >;

  try {
    for (const { model, table } of PLAN) {
      const rows = await legacy[model].findMany();
      if (rows.length === 0) {
        console.log(`${table}: 0 rows, skipped`);
        continue;
      }
      // Chunk to stay under parameter limits on large tables.
      const CHUNK = 200;
      let count = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const res = await target[model].createMany({
          data: rows.slice(i, i + CHUNK),
          skipDuplicates: true,
        });
        count += res.count;
      }
      console.log(`${table}: ${count}/${rows.length} rows copied`);
    }
  } finally {
    await sqlite.$disconnect();
  }
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pg.$disconnect();
  });
