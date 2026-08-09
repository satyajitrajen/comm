import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/modules/auth/auth.service';
import { ChatsService } from '../src/modules/chats/chats.service';
import { MessagesService } from '../src/modules/messages/messages.service';
import { PrismaService } from '../src/prisma.service';

describe('Veloce E2E Core Integration Test Suite', () => {
  let app: INestApplication;
  let authService: AuthService;
  let chatsService: ChatsService;
  let messagesService: MessagesService;
  let prismaService: PrismaService;

  beforeAll(async () => {
    // 1. Bootstrap the entire NestJS application module in memory
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    authService = moduleFixture.get<AuthService>(AuthService);
    chatsService = moduleFixture.get<ChatsService>(ChatsService);
    messagesService = moduleFixture.get<MessagesService>(MessagesService);
    prismaService = moduleFixture.get<PrismaService>(PrismaService);

    // Clean historical testing data to ensure isolation
    await prismaService.$executeRawUnsafe('DELETE FROM users');
    await prismaService.$executeRawUnsafe('DELETE FROM workspaces');
    await prismaService.$executeRawUnsafe('DELETE FROM conversations');
  });

  afterAll(async () => {
    await prismaService.$disconnect();
    await app.close();
  });

  it('should successfully run entire user onboarding, authentication and messaging lifecycle', async () => {
    // ----------------------------------------------------
    // STEP 1: Register User Alice & User Bob
    // ----------------------------------------------------
    const aliceDetails = await authService.register({
      email: 'alice@acme.com',
      password: 'SecurePassword123!',
      displayName: 'Alice Green',
      phoneNumber: '+1 555-0101',
    });

    const bobDetails = await authService.register({
      email: 'bob@acme.com',
      password: 'SecurePassword123!',
      displayName: 'Bob Smith',
      phoneNumber: '+1 555-0102',
    });

    expect(aliceDetails.id).toBeDefined();
    expect(bobDetails.id).toBeDefined();
    expect(aliceDetails.email).toBe('alice@acme.com');
    expect(bobDetails.displayName).toBe('Bob Smith');

    // ----------------------------------------------------
    // STEP 2: Login With Password & Retrieve Access Tokens
    // ----------------------------------------------------
    const authSession = await authService.login({
      email: 'alice@acme.com',
      password: 'SecurePassword123!',
      ipAddress: '127.0.0.1',
      userAgent: 'Jest Test Agent',
    });

    if ('needsTwoFactor' in authSession) {
      throw new Error('Unexpected 2FA challenge');
    }

    expect(authSession.accessToken).toBeDefined();
    expect(authSession.refreshToken).toBeDefined();
    expect(authSession.user.displayName).toBe('Alice Green');

    // ----------------------------------------------------
    // STEP 4: Start a Direct Conversation
    // ----------------------------------------------------
    const chat = await chatsService.createDirectChat(
      aliceDetails.id,
      bobDetails.id,
    );
    expect(chat.id).toBeDefined();
    expect(chat.type).toBe('DIRECT');
    expect(chat.participants.length).toBe(2);

    // ----------------------------------------------------
    // STEP 5: Send Real-Time Text Message
    // ----------------------------------------------------
    const message = await messagesService.sendMessage(aliceDetails.id, {
      conversationId: chat.id,
      content: 'Hello Bob! Please check the quarterly reports.',
    });

    expect(message.id).toBeDefined();
    expect(message.content).toBe(
      'Hello Bob! Please check the quarterly reports.',
    );
    expect(message.senderId).toBe(aliceDetails.id);

    // ----------------------------------------------------
    // STEP 6: Verify and Assert Message Editing (5m Limit)
    // ----------------------------------------------------
    const editedMsg = await messagesService.editMessage(
      aliceDetails.id,
      message.id,
      'Hello Bob! Please check the Q3 quarterly reports.',
    );

    expect(editedMsg.isEdited).toBe(true);
    expect(editedMsg.content).toBe(
      'Hello Bob! Please check the Q3 quarterly reports.',
    );

    // ----------------------------------------------------
    // STEP 7: Add Emoji Reactions
    // ----------------------------------------------------
    const reaction = await messagesService.addReaction(
      bobDetails.id,
      message.id,
      '👍',
    );
    expect(reaction.emoji).toBe('👍');
    expect(reaction.userId).toBe(bobDetails.id);

    // ----------------------------------------------------
    // STEP 8: Create interactive Group Poll
    // ----------------------------------------------------
    const pollMsg = await messagesService.createPoll(aliceDetails.id, {
      conversationId: chat.id,
      question: 'Best time for sync meeting?',
      options: ['10:00 AM', '02:00 PM'],
    });

    if (!pollMsg?.polls?.options[0]) {
      throw new Error('Expected poll message fixture to be created');
    }

    expect(pollMsg.messageType).toBe('POLL');
    expect(pollMsg.polls).toBeDefined();
    expect(pollMsg.polls.question).toBe('Best time for sync meeting?');
    expect(pollMsg.polls.options.length).toBe(2);

    // ----------------------------------------------------
    // STEP 9: Cast Poll Votes
    // ----------------------------------------------------
    const firstOptionId = pollMsg.polls.options[0].id;
    const votedPoll = await messagesService.votePoll(
      bobDetails.id,
      pollMsg.polls.id,
      firstOptionId,
    );

    if (!votedPoll) {
      throw new Error('Expected poll vote fixture to be updated');
    }

    expect(votedPoll.votes.length).toBe(1);
    expect(votedPoll.votes[0].userId).toBe(bobDetails.id);
  });
});
