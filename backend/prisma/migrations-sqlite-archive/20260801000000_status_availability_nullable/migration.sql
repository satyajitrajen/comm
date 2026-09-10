-- Reduce UserProfile.statusAvailability to *declared availability only*.
--
-- The column previously mixed two unrelated concerns:
--   - connection state ('ACTIVE' / 'OFFLINE'), which is derived and ephemeral
--   - declared intent ('AWAY' / 'DND' / 'OUT_OF_OFFICE'), which is durable
--
-- Storing the first made every new user appear Online before they had ever
-- connected, stranded users Online after a restart, and meant a reconnect
-- clobbered whatever the user had chosen.
--
-- Connection state now lives in memory (PresenceService) and is never
-- persisted. This column keeps only what the user declared:
--   AWAY / DND / OUT_OF_OFFICE  -> an explicit override
--   NULL                        -> no override; live presence decides
--
-- SQLite cannot ALTER a column's nullability, so the table is rebuilt.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_UserProfile" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "aboutText" TEXT NOT NULL DEFAULT 'Hey there! I am using Veloce.',
    "statusAvailability" TEXT,
    "lastSeen" DATETIME,
    "privacyLastSeen" TEXT NOT NULL DEFAULT 'EVERYONE',
    "privacyProfilePhoto" TEXT NOT NULL DEFAULT 'EVERYONE',
    "privacyReadReceipts" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Carry data over, dropping the two values that described connection state
-- rather than declared intent. Neither is meaningful in this column any more:
--   'ACTIVE'  -> presence is no longer persisted at all
--   'OFFLINE' -> was never a valid status; absence of an override is NULL
-- Declared AWAY / DND / OUT_OF_OFFICE choices are preserved.
INSERT INTO "new_UserProfile" (
    "userId", "displayName", "avatarUrl", "aboutText", "statusAvailability",
    "lastSeen", "privacyLastSeen", "privacyProfilePhoto", "privacyReadReceipts", "updatedAt"
)
SELECT
    "userId", "displayName", "avatarUrl", "aboutText",
    CASE WHEN "statusAvailability" IN ('ACTIVE', 'OFFLINE') THEN NULL ELSE "statusAvailability" END,
    "lastSeen", "privacyLastSeen", "privacyProfilePhoto", "privacyReadReceipts", "updatedAt"
FROM "UserProfile";

DROP TABLE "UserProfile";
ALTER TABLE "new_UserProfile" RENAME TO "UserProfile";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
