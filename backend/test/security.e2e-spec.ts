import 'dotenv/config';
import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WsException } from '@nestjs/websockets';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/modules/auth/auth.service';
import { ChatsService } from '../src/modules/chats/chats.service';
import { MessagesService } from '../src/modules/messages/messages.service';
import { RealtimeGateway } from '../src/modules/realtime/realtime.gateway';
import { PrismaService } from '../src/prisma.service';

describe('Security authorization boundaries', () => {
  let app: INestApplication;
  let authService: AuthService;
  let chatsService: ChatsService;
  let messagesService: MessagesService;
  let realtimeGateway: RealtimeGateway;
  let prismaService: PrismaService;
  let suffix: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    authService = moduleFixture.get<AuthService>(AuthService);
    chatsService = moduleFixture.get<ChatsService>(ChatsService);
    messagesService = moduleFixture.get<MessagesService>(MessagesService);
    realtimeGateway = moduleFixture.get<RealtimeGateway>(RealtimeGateway);
    prismaService = moduleFixture.get<PrismaService>(PrismaService);
  });

  beforeEach(() => {
    suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  });

  afterEach(async () => {
    await prismaService.workspace.deleteMany({
      where: { subdomain: { startsWith: `security-${suffix}` } },
    });
    await prismaService.user.deleteMany({
      where: { email: { endsWith: `.${suffix}@security.test` } },
    });
  });

  afterAll(async () => {
    await prismaService.$disconnect();
    await app.close();
  });

  async function registerUser(name: string) {
    return authService.register({
      email: `${name}.${suffix}@security.test`,
      password: 'SecurePassword123!',
      displayName: name,
    });
  }

  async function createExternalUser() {
    const workspace = await prismaService.workspace.create({
      data: {
        name: 'Security External Workspace',
        subdomain: `security-${suffix}`,
      },
    });
    const user = await prismaService.user.create({
      data: {
        email: `outsider.${suffix}@security.test`,
        passwordHash: 'not-used',
        profile: {
          create: {
            displayName: 'Outsider',
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

    return user;
  }

  it('rejects registration without an explicit password', async () => {
    await expect(
      authService.register({
        email: `missing-password.${suffix}@security.test`,
        displayName: 'Missing Password',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('blocks non-participants from mutating conversation resources', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const eve = await registerUser('eve');
    const chat = await chatsService.createDirectChat(alice.id, bob.id);
    const message = await messagesService.sendMessage(alice.id, {
      conversationId: chat.id,
      content: 'private message',
    });
    const pollMessage = await messagesService.createPoll(alice.id, {
      conversationId: chat.id,
      question: 'Private poll?',
      options: ['Yes', 'No'],
    });

    if (!pollMessage?.polls?.options[0]) {
      throw new Error('Expected poll fixture to include options');
    }

    await expect(
      messagesService.addReaction(eve.id, message.id, '👍'),
    ).rejects.toThrow(/participant/i);

    await expect(
      messagesService.createTaskFromMessage(eve.id, {
        messageId: message.id,
        title: 'Steal private task',
        assigneeIds: [eve.id],
      }),
    ).rejects.toThrow(/participant/i);

    await expect(
      messagesService.createPoll(eve.id, {
        conversationId: chat.id,
        question: 'Injected poll?',
        options: ['A', 'B'],
      }),
    ).rejects.toThrow(/participant/i);

    await expect(
      messagesService.votePoll(
        eve.id,
        pollMessage.polls.id,
        pollMessage.polls.options[0].id,
      ),
    ).rejects.toThrow(/participant/i);
  });

  it('blocks cross-workspace chat creation', async () => {
    const alice = await registerUser('alice-workspace');
    const outsider = await createExternalUser();

    await expect(
      chatsService.createDirectChat(alice.id, outsider.id),
    ).rejects.toThrow(/workspace/i);

    await expect(
      chatsService.createGroupChat(alice.id, {
        name: 'Cross workspace group',
        participantIds: [outsider.id],
      }),
    ).rejects.toThrow(/workspace/i);
  });

  it('blocks socket room joins for non-participants', async () => {
    const alice = await registerUser('alice-socket');
    const bob = await registerUser('bob-socket');
    const eve = await registerUser('eve-socket');
    const chat = await chatsService.createDirectChat(alice.id, bob.id);
    const fakeClient = {
      id: 'socket-test',
      data: { userId: eve.id },
      join: jest.fn(),
    };

    await expect(
      realtimeGateway.handleJoinRoom(
        { conversationId: chat.id },
        fakeClient as never,
      ),
    ).rejects.toThrow(WsException);
    expect(fakeClient.join).not.toHaveBeenCalled();
  });
});
