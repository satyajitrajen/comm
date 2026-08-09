import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

function seedMeetingRoomLink(): string {
  const code = randomBytes(9)
    .toString('base64')
    .replace(/\+/g, '')
    .replace(/\//g, '')
    .replace(/=/g, '')
    .slice(0, 12);
  return `https://teamtime.live/room/${code}`;
}

const prisma = new PrismaClient();

// ── User roster ────────────────────────────────────────────────────────────
// Admins: Satyajit Nikam, Sanket Ankush, Ketan Shete, Sanket Ganjegaonkar
// All belong to department: IT
const DEPARTMENT = 'IT';

const ADMINS = new Set([
  'Satyajit Nikam',
  'Sanket Ankush',
  'Ketan Shete',
  'Sanket Ganjegaonkar',
]);

// First admin is the workspace OWNER
const OWNER = 'Satyajit Nikam';

const roster = [
  // Admins first so OWNER is index 0
  'Satyajit Nikam',
  'Sanket Ankush',
  'Ketan Shete',
  'Sanket Ganjegaonkar',

  // Regular members
  'Anupriya Shrivastava',
  'Bhairav Doijad',
  'Chaitanya Agarkar',
  'Divya Kaujalgikar',
  'Dnyaneshwar Rale',
  'Lokesh Patil',
  'Mayur Gadekar',
  'Nikhil Khatate',
  'Om Thorwat',
  'Pranav Patil',
  'Rugved Dhorje',
  'Sanket Ankush',      // already in admins, deduplicated below
  'Shreyas Bhokare',
  'Shreyas Kadam',
  'Smita Kumbhar',
  'Sourabh Mahadik',
  'Sourabh Rahandale',
  'Swapnil Ganjegaonkar',
  'Tanuja Shelke',
];

// Deduplicate (Sanket Ankush appeared twice)
const uniqueRoster = Array.from(new Set(roster));

function toEmail(name: string) {
  return name.toLowerCase().replace(/\s+/g, '.') + '@teamtime.live';
}

function toRole(name: string): 'OWNER' | 'ADMIN' | 'MEMBER' {
  if (name === OWNER) return 'OWNER';
  if (ADMINS.has(name)) return 'ADMIN';
  return 'MEMBER';
}

async function main() {
  console.log('🗑️  Wiping existing data...');

  // Delete everything in safe order (cascade-aware)
  await prisma.notification.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.task.deleteMany().catch(() => {});
  await prisma.poll.deleteMany().catch(() => {});
  await prisma.message.deleteMany();
  await prisma.conversationParticipant.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.file.deleteMany();
  await prisma.appIntegration.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.workspaceUser.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();

  console.log('✅ Old data cleared.');

  const passwordHash = await bcrypt.hash('Password123!', 10);

  // ── Create workspace ───────────────────────────────────────────────────
  const workspace = await prisma.workspace.create({
    data: {
      name: 'TeamTime',
      subdomain: 'teamtime',
      customPrimaryColor: '#0b55ca',
    },
  });

  await prisma.setting.create({
    data: {
      tenantType: 'WORKSPACE',
      tenantId: workspace.id,
      key: 'approval_cycle',
      value: JSON.stringify({
        enabled: true,
        requiredApprovals: 1,
        approverRole: 'ADMIN',
        appliesTo: ['USER_CREATION', 'USER_EDITS'],
        autoApproveAdmins: true,
        escalationHours: 24,
      }),
    },
  });

  // ── Create users ───────────────────────────────────────────────────────
  const users: Record<string, { id: string; displayName: string }> = {};

  for (const name of uniqueRoster) {
    const role = toRole(name);
    const email = toEmail(name);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        profile: {
          create: {
            displayName: name,
            aboutText: `${DEPARTMENT} Team`,
            statusAvailability: 'ACTIVE',
          },
        },
        workspaceUsers: {
          create: {
            workspaceId: workspace.id,
            role,
            department: DEPARTMENT,
          },
        },
      },
      include: { profile: true },
    });

    users[name] = { id: user.id, displayName: name };
    console.log(`  👤 ${name} (${email}) — ${role}`);
  }

  // Demo account for two-factor login (OTP printed in server logs in development)
  const twoFaDemoName = 'Mayur Gadekar';
  if (users[twoFaDemoName]) {
    await prisma.user.update({
      where: { id: users[twoFaDemoName].id },
      data: { isTwoFactorEnabled: true },
    });
    console.log(
      `  🔐 Two-factor enabled for demo user: ${toEmail(twoFaDemoName)} (Password123!) — OTP is logged on login in development`,
    );
  }

  const allIds = Object.values(users).map((u) => u.id);
  const owner = users[OWNER];

  // ── Helper to create a group conversation ─────────────────────────────
  async function createChannel({
    name,
    description,
    type = 'GROUP',
    spaceType,
    isReadOnly = false,
    participants = allIds,
    messages,
  }: {
    name: string;
    description?: string;
    type?: 'GROUP' | 'BROADCAST';
    spaceType: 'TEAM_CHANNEL' | 'ORG_FEED' | 'ANNOUNCEMENT' | 'LEADERSHIP';
    isReadOnly?: boolean;
    participants?: string[];
    messages?: Array<{ author: string; content: string; type?: string }>;
  }) {
    const conv = await prisma.conversation.create({
      data: {
        workspaceId: workspace.id,
        type,
        group: {
          create: {
            name,
            description,
            spaceType,
            isReadOnly,
            createdBy: owner.id,
          },
        },
        participants: {
          create: participants.map((userId) => ({ userId })),
        },
      },
    });

    if (messages) {
      for (const [i, msg] of messages.entries()) {
        const sender = users[msg.author];
        if (!sender) continue;
        await prisma.message.create({
          data: {
            conversationId: conv.id,
            senderId: sender.id,
            content: msg.content,
            messageType: msg.type || 'TEXT',
            createdAt: new Date(Date.now() - (messages.length - i) * 15 * 60 * 1000),
          },
        });
      }
    }

    return conv;
  }

  // ── Channels ───────────────────────────────────────────────────────────
  await createChannel({
    name: 'general',
    description: 'General discussion for the whole team',
    spaceType: 'TEAM_CHANNEL',
    messages: [
      { author: 'Satyajit Nikam', content: 'Welcome everyone to TeamTime! This is our new communication platform.' },
      { author: 'Sanket Ankush', content: "Great to be here. Let's make good use of this!" },
      { author: 'Pranav Patil', content: 'Hello everyone 👋' },
      { author: 'Shreyas Bhokare', content: 'Looking forward to using this platform.' },
      { author: 'Nikhil Khatate', content: 'Good morning team!' },
    ],
  });

  const announcementChannel = await createChannel({
    name: 'announcements',
    description: 'Official company announcements',
    type: 'BROADCAST',
    spaceType: 'ANNOUNCEMENT',
    isReadOnly: true,
    messages: [
      { author: 'Satyajit Nikam', content: 'TeamTime is now live for the IT department. Please complete your profile setup.', type: 'BROADCAST' },
      { author: 'Ketan Shete', content: 'Reminder: Team standup is at 10:00 AM daily. Please be on time.', type: 'BROADCAST' },
    ],
  });

  await createChannel({
    name: 'random',
    description: 'Off-topic chats and fun stuff',
    spaceType: 'ORG_FEED',
    messages: [
      { author: 'Om Thorwat', content: 'Anyone up for lunch today?' },
      { author: 'Rugved Dhorje', content: 'Sure, let\'s go at 1 PM!' },
      { author: 'Divya Kaujalgikar', content: 'Count me in 🙋' },
    ],
  });

  await createChannel({
    name: 'dev-updates',
    description: 'Development updates and technical discussions',
    spaceType: 'TEAM_CHANNEL',
    messages: [
      { author: 'Sanket Ganjegaonkar', content: 'Backend API v2 is deployed to staging. Please test your integrations.' },
      { author: 'Swapnil Ganjegaonkar', content: 'Frontend build is green. Pushing to staging now.' },
      { author: 'Chaitanya Agarkar', content: 'Database migration completed successfully.' },
      { author: 'Dnyaneshwar Rale', content: 'All smoke tests passing ✅' },
    ],
  });

  const leadershipChannel = await createChannel({
    name: 'leadership',
    description: 'Leadership updates and strategic direction',
    type: 'BROADCAST',
    spaceType: 'LEADERSHIP',
    isReadOnly: true,
    participants: allIds.filter((id) =>
      ['Satyajit Nikam', 'Sanket Ankush', 'Ketan Shete', 'Sanket Ganjegaonkar'].map((n) => users[n]?.id).includes(id)
    ),
    messages: [
      { author: 'Satyajit Nikam', content: 'Q2 goals are set. Focus on delivery and quality.', type: 'BROADCAST' },
    ],
  });

  const publisherUserIds = [...ADMINS]
    .map((name) => users[name]?.id)
    .filter((id): id is string => Boolean(id));
  const publisherRows = publisherUserIds.flatMap((userId) => [
    {
      workspaceId: workspace.id,
      conversationId: announcementChannel.id,
      userId,
    },
    {
      workspaceId: workspace.id,
      conversationId: leadershipChannel.id,
      userId,
    },
  ]);
  if (publisherRows.length > 0) {
    await prisma.announcementPublisher.createMany({ data: publisherRows });
  }

  // ── Calendar events ────────────────────────────────────────────────────
  const events = [
    ['Daily Standup', 'IT', 1, 10],
    ['Sprint Planning', 'IT', 3, 11],
    ['Code Review', 'IT', 2, 14],
    ['Team Retrospective', 'IT', 5, 16],
  ] as const;

  for (const [title, teamName, dayOffset, hour] of events) {
    const startsAt = new Date();
    startsAt.setDate(startsAt.getDate() + dayOffset);
    startsAt.setHours(hour, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    await prisma.calendarEvent.create({
      data: {
        workspaceId: workspace.id,
        title,
        teamName,
        startsAt,
        endsAt,
        meetingLink: seedMeetingRoomLink(),
        createdBy: owner.id,
      },
    });
  }

  console.log('\n✅ Seeding complete!');
  console.log('─────────────────────────────────────────');
  console.log('Workspace : TeamTime');
  console.log('Password  : Password123!  (all users)');
  console.log('─────────────────────────────────────────');
  console.log('ADMINS:');
  for (const name of ADMINS) {
    console.log(`  ${toEmail(name)}`);
  }
  console.log('MEMBERS:');
  for (const name of uniqueRoster) {
    if (!ADMINS.has(name) && name !== OWNER) {
      console.log(`  ${toEmail(name)}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
