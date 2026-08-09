import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/modules/auth/auth.service';
import { PrismaService } from '../src/prisma.service';

describe('Workspace product surfaces', () => {
  type AppIntegrationResponse = { id: string; isConnected: boolean };
  type CalendarEventResponse = { id: string; title: string };
  type AdminUserResponse = {
    userId: string;
    email: string | null;
    role: string;
    department: string | null;
    statusAvailability: string;
    isActive: boolean;
  };
  type ApprovalSettingsResponse = {
    enabled: boolean;
    requiredApprovals: number;
    approverRole: string;
    appliesTo: string[];
    autoApproveAdmins: boolean;
    escalationHours: number;
  };
  type PaginatedResponse = { items: unknown[] };

  let app: INestApplication<App>;
  let authService: AuthService;
  let prismaService: PrismaService;
  let workspaceId: string;
  let userId: string;
  let teammateId: string;
  let managedUserId: string | undefined;
  let token: string;
  let teammateToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    authService = moduleFixture.get<AuthService>(AuthService);
    prismaService = moduleFixture.get<PrismaService>(PrismaService);
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const passwordHash = await bcrypt.hash('SecurePassword123!', 10);
    const workspace = await prismaService.workspace.create({
      data: {
        name: 'Surface Test Workspace',
        subdomain: `surface-${suffix}`,
      },
    });
    const user = await prismaService.user.create({
      data: {
        email: `surface.${suffix}@example.test`,
        passwordHash,
        profile: {
          create: {
            displayName: 'Surface Tester',
          },
        },
        workspaceUsers: {
          create: {
            workspaceId: workspace.id,
            role: 'OWNER',
          },
        },
      },
    });
    const teammate = await prismaService.user.create({
      data: {
        email: `surface.teammate.${suffix}@example.test`,
        passwordHash,
        profile: {
          create: {
            displayName: 'Surface Teammate',
          },
        },
        workspaceUsers: {
          create: {
            workspaceId: workspace.id,
            role: 'MEMBER',
          },
        },
      },
    });

    workspaceId = workspace.id;
    userId = user.id;
    teammateId = teammate.id;
    managedUserId = undefined;

    const session = await authService.login({
      email: user.email ?? undefined,
      password: 'SecurePassword123!',
      ipAddress: '127.0.0.1',
      userAgent: 'Jest Surface Test',
    });
    const teammateSession = await authService.login({
      email: teammate.email ?? undefined,
      password: 'SecurePassword123!',
      ipAddress: '127.0.0.1',
      userAgent: 'Jest Surface Test',
    });
    if ('needsTwoFactor' in session || 'needsTwoFactor' in teammateSession) {
      throw new Error('Unexpected 2FA challenge');
    }
    token = session.accessToken;
    teammateToken = teammateSession.accessToken;
  });

  afterEach(async () => {
    if (workspaceId) {
      await prismaService.workspace.deleteMany({ where: { id: workspaceId } });
    }
    if (userId) {
      await prismaService.user.deleteMany({ where: { id: userId } });
    }
    if (teammateId) {
      await prismaService.user.deleteMany({ where: { id: teammateId } });
    }
    if (managedUserId) {
      await prismaService.user.deleteMany({ where: { id: managedUserId } });
    }
  });

  afterAll(async () => {
    await prismaService.$disconnect();
    await app.close();
  });

  it('exposes guarded apps, calendar, tasks, files, and notifications APIs', async () => {
    const appsResponse = await request(app.getHttpServer())
      .get('/api/v1/apps')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const apps = appsResponse.body as AppIntegrationResponse[];
    expect(apps.length).toBeGreaterThan(0);

    const toggledApp = await request(app.getHttpServer())
      .patch(`/api/v1/apps/${apps[0].id}/toggle`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const toggledAppBody = toggledApp.body as AppIntegrationResponse;
    expect(toggledAppBody.id).toBe(apps[0].id);

    const startsAt = new Date(Date.now() + 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
    const createdEvent = await request(app.getHttpServer())
      .post('/api/v1/calendar')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Surface planning sync',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        teamName: 'Product',
      })
      .expect(201);
    const createdEventBody = createdEvent.body as CalendarEventResponse;
    expect(createdEventBody.title).toBe('Surface planning sync');

    const eventsResponse = await request(app.getHttpServer())
      .get('/api/v1/calendar')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const events = eventsResponse.body as CalendarEventResponse[];
    expect(events.some((event) => event.id === createdEventBody.id)).toBe(true);

    const tasksResponse = await request(app.getHttpServer())
      .get('/api/v1/tasks?scope=workspace')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(tasksResponse.body)).toBe(true);

    await prismaService.file.create({
      data: {
        workspaceId,
        uploadedBy: userId,
        filename: 'Surface Spec.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: BigInt(4096),
        storageKey: `surface-${workspaceId}.pdf`,
        isMalwareScanned: true,
        malwareScanResult: 'CLEAN',
      },
    });

    const filesResponse = await request(app.getHttpServer())
      .get('/api/v1/files')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const filesBody = filesResponse.body as PaginatedResponse;
    expect(Array.isArray(filesBody.items)).toBe(true);
    expect(filesBody.items[0]).toEqual(
      expect.objectContaining({ fileSizeBytes: '4096' }),
    );

    const notificationsResponse = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const notificationsBody = notificationsResponse.body as PaginatedResponse;
    expect(Array.isArray(notificationsBody.items)).toBe(true);
  });

  it('wires backend-only collaboration surfaces for groups, tasks, files, and dashboard', async () => {
    const createdGroup = await request(app.getHttpServer())
      .post('/api/v1/chats/group')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Surface Launch',
        description: 'Backend wired launch room',
        participantIds: [],
        teamName: 'Product',
        channelSlug: 'surface-launch',
        spaceType: 'TEAM_CHANNEL',
        isReadOnly: false,
      })
      .expect(201);

    expect(createdGroup.body.group).toEqual(
      expect.objectContaining({
        name: 'Surface Launch',
        teamName: 'Product',
        channelSlug: 'surface-launch',
        spaceType: 'TEAM_CHANNEL',
        isReadOnly: false,
      }),
    );

    const conversationId = createdGroup.body.id as string;

    const teammateFeed = await request(app.getHttpServer())
      .get('/api/v1/chats')
      .set('Authorization', `Bearer ${teammateToken}`)
      .expect(200);
    expect(teammateFeed.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conversationId,
          isMember: false,
        }),
      ]),
    );

    await request(app.getHttpServer())
      .post(`/api/v1/chats/${conversationId}/join`)
      .set('Authorization', `Bearer ${teammateToken}`)
      .expect(201);

    const joinedFeed = await request(app.getHttpServer())
      .get('/api/v1/chats')
      .set('Authorization', `Bearer ${teammateToken}`)
      .expect(200);
    expect(joinedFeed.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conversationId,
          isMember: true,
        }),
      ]),
    );

    await request(app.getHttpServer())
      .delete(`/api/v1/chats/${conversationId}/leave`)
      .set('Authorization', `Bearer ${teammateToken}`)
      .expect(200);

    const createdTask = await request(app.getHttpServer())
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        conversationId,
        title: 'Verify backend-only UI wiring',
        assigneeIds: [],
        priority: 'IMPORTANT',
        dueDate: new Date(Date.now() + 86400000).toISOString(),
      })
      .expect(201);
    expect(createdTask.body).toEqual(
      expect.objectContaining({
        title: 'Verify backend-only UI wiring',
        conversationId,
      }),
    );

    const uploaded = await request(app.getHttpServer())
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${token}`)
      .field('conversationId', conversationId)
      .attach('file', Buffer.from('surface file'), 'surface.txt')
      .expect(201);
    expect(uploaded.body).toEqual(
      expect.objectContaining({
        filename: 'surface.txt',
        storageProvider: 'LOCAL',
      }),
    );

    await request(app.getHttpServer())
      .get(`/api/v1/files/${uploaded.body.id}/download`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Content-Type', /text\/plain/);

    const channelFiles = await request(app.getHttpServer())
      .get(`/api/v1/files?conversationId=${conversationId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(channelFiles.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: uploaded.body.id,
        }),
      ]),
    );

    const dashboard = await request(app.getHttpServer())
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(dashboard.body.stats.openTasks).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(dashboard.body.recentConversations)).toBe(true);
  });

  it('marks direct messages as read when the recipient opens history', async () => {
    const directChat = await request(app.getHttpServer())
      .post('/api/v1/chats/direct')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetUserId: teammateId })
      .expect(201);

    const conversationId = directChat.body.id as string;

    await request(app.getHttpServer())
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${teammateToken}`)
      .send({
        conversationId,
        content: 'Unread counter should clear when this DM is opened.',
      })
      .expect(201);

    const unreadFeed = await request(app.getHttpServer())
      .get('/api/v1/chats')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(unreadFeed.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conversationId,
          unreadCount: 1,
        }),
      ]),
    );

    await request(app.getHttpServer())
      .get(`/api/v1/chats/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const readFeed = await request(app.getHttpServer())
      .get('/api/v1/chats')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(readFeed.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conversationId,
          unreadCount: 0,
        }),
      ]),
    );
  });

  it('guards admin users and persists approval cycle settings', async () => {
    const adminUsersResponse = await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const adminUsers = adminUsersResponse.body as AdminUserResponse[];
    expect(adminUsers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId,
          role: 'OWNER',
        }),
        expect.objectContaining({
          userId: teammateId,
          role: 'MEMBER',
        }),
      ]),
    );

    await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${teammateToken}`)
      .expect(403);

    const createdUser = await request(app.getHttpServer())
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: `managed.${workspaceId}@example.test`,
        password: 'SecurePassword123!',
        displayName: 'Managed User',
        role: 'MANAGER',
        department: 'Operations',
        statusAvailability: 'AWAY',
      })
      .expect(201);
    const createdUserBody = createdUser.body as AdminUserResponse;
    managedUserId = createdUserBody.userId;
    expect(createdUserBody).toEqual(
      expect.objectContaining({
        email: `managed.${workspaceId}@example.test`,
        role: 'MANAGER',
        department: 'Operations',
        statusAvailability: 'AWAY',
        isActive: true,
      }),
    );

    const updatedUser = await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${managedUserId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        role: 'ADMIN',
        department: 'Administration',
        statusAvailability: 'ACTIVE',
        isActive: false,
      })
      .expect(200);
    const updatedUserBody = updatedUser.body as AdminUserResponse;
    expect(updatedUserBody).toEqual(
      expect.objectContaining({
        role: 'ADMIN',
        department: 'Administration',
        statusAvailability: 'ACTIVE',
        isActive: false,
      }),
    );

    await request(app.getHttpServer())
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${teammateToken}`)
      .send({
        email: `blocked.${workspaceId}@example.test`,
        password: 'SecurePassword123!',
        displayName: 'Blocked User',
      })
      .expect(403);

    const initialApproval = await request(app.getHttpServer())
      .get('/api/v1/admin/settings/approval-cycle')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const initialApprovalBody =
      initialApproval.body as ApprovalSettingsResponse;
    expect(initialApprovalBody.enabled).toBe(true);
    expect(initialApprovalBody.appliesTo).toContain('USER_CREATION');

    const updatedApproval = await request(app.getHttpServer())
      .patch('/api/v1/admin/settings/approval-cycle')
      .set('Authorization', `Bearer ${token}`)
      .send({
        enabled: true,
        requiredApprovals: 2,
        approverRole: 'MANAGER',
        appliesTo: ['USER_CREATION', 'USER_EDITS', 'CHANNEL_CREATION'],
        autoApproveAdmins: false,
        escalationHours: 48,
      })
      .expect(200);
    const updatedApprovalBody =
      updatedApproval.body as ApprovalSettingsResponse;
    expect(updatedApprovalBody).toEqual(
      expect.objectContaining({
        requiredApprovals: 2,
        approverRole: 'MANAGER',
        autoApproveAdmins: false,
        escalationHours: 48,
      }),
    );

    const persistedApproval = await request(app.getHttpServer())
      .get('/api/v1/admin/settings/approval-cycle')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(persistedApproval.body).toEqual(updatedApprovalBody);

    const auditCount = await prismaService.auditLog.count({
      where: {
        workspaceId,
        action: {
          in: [
            'ADMIN_USER_CREATED',
            'ADMIN_USER_UPDATED',
            'APPROVAL_CYCLE_UPDATED',
          ],
        },
      },
    });
    expect(auditCount).toBeGreaterThanOrEqual(3);
  });

  it('paginates call history with cursors and scopes it to participants', async () => {
    type CallHistoryPage = {
      messages: Array<{ id: string; messageType: string }>;
      hasMore: boolean;
      nextCursor: string | null;
    };
    type CallHistoryResponse = { body: CallHistoryPage };

    const createdGroup = await request(app.getHttpServer())
      .post('/api/v1/chats/group')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Call Log Channel',
        description: 'Call events live in the Message table',
        participantIds: [],
        teamName: 'Product',
        channelSlug: 'call-log-channel',
        spaceType: 'TEAM_CHANNEL',
        isReadOnly: false,
      })
      .expect(201);
    const conversationId = createdGroup.body.id as string;

    // Four call events and one plain text message.
    const callTypes = [
      'SYSTEM_CALL_START',
      'SYSTEM_CALL_END',
      'SYSTEM_CALL_DECLINE',
      'SYSTEM_CALL_START',
    ];
    for (const messageType of callTypes) {
      await request(app.getHttpServer())
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ conversationId, content: `call ${messageType}`, messageType })
        .expect(201);
    }
    await request(app.getHttpServer())
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        conversationId,
        content: 'plain text must be excluded',
        messageType: 'TEXT',
      })
      .expect(201);

    // Page 1: newest first, only call events.
    const first = (await request(app.getHttpServer())
      .get('/api/v1/messages/call-history?limit=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)) as CallHistoryResponse;
    expect(first.body.hasMore).toBe(true);
    expect(first.body.messages).toHaveLength(2);
    for (const message of first.body.messages) {
      expect(message.messageType).not.toBe('TEXT');
      expect([
        'SYSTEM_CALL_START',
        'SYSTEM_CALL_END',
        'SYSTEM_CALL_DECLINE',
      ]).toContain(message.messageType);
    }

    // Walk the cursor to the end; every record appears exactly once.
    const seen: string[] = [];
    let cursor: string | null = first.body.nextCursor;
    seen.push(...first.body.messages.map((m) => m.id));
    while (cursor) {
      const next = (await request(app.getHttpServer())
        .get(`/api/v1/messages/call-history?limit=2&before=${cursor}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)) as CallHistoryResponse;
      seen.push(...next.body.messages.map((m) => m.id));
      cursor = next.body.nextCursor;
    }
    expect(seen).toHaveLength(4);
    expect(new Set(seen).size).toBe(4);

    // Non-participants see nothing for a conversation they are not in.
    const outsiderScoped = (await request(app.getHttpServer())
      .get(`/api/v1/messages/call-history?conversationId=${conversationId}`)
      .set('Authorization', `Bearer ${teammateToken}`)
      .expect(200)) as CallHistoryResponse;
    expect(outsiderScoped.body.messages).toHaveLength(0);

    // Joining the channel makes the same events visible.
    await request(app.getHttpServer())
      .post(`/api/v1/chats/${conversationId}/join`)
      .set('Authorization', `Bearer ${teammateToken}`)
      .expect(201);
    const memberScoped = (await request(app.getHttpServer())
      .get(`/api/v1/messages/call-history?conversationId=${conversationId}`)
      .set('Authorization', `Bearer ${teammateToken}`)
      .expect(200)) as CallHistoryResponse;
    expect(memberScoped.body.messages).toHaveLength(4);
    expect(memberScoped.body.hasMore).toBe(false);

    // Reading call history must not mark conversations as read.
    const directChat = await request(app.getHttpServer())
      .post('/api/v1/chats/direct')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetUserId: teammateId })
      .expect(201);
    const dmId = directChat.body.id as string;
    await request(app.getHttpServer())
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${teammateToken}`)
      .send({
        conversationId: dmId,
        content: 'stays unread after call history',
      })
      .expect(201);

    const unreadBefore = await request(app.getHttpServer())
      .get('/api/v1/chats')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(unreadBefore.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ conversationId: dmId, unreadCount: 1 }),
      ]),
    );

    await request(app.getHttpServer())
      .get('/api/v1/messages/call-history')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const unreadAfter = await request(app.getHttpServer())
      .get('/api/v1/chats')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(unreadAfter.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ conversationId: dmId, unreadCount: 1 }),
      ]),
    );
  });
});
