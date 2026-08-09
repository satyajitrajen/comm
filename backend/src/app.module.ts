import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { UserAwareThrottlerGuard } from './common/guards/user-aware-throttler.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ChatsModule } from './modules/chats/chats.module';
import { MessagesModule } from './modules/messages/messages.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { FilesModule } from './modules/files/files.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { AppsModule } from './modules/apps/apps.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AdminModule } from './modules/admin/admin.module';
import { PermissionsModule } from './common/permissions.module';
import { PresenceModule } from './common/presence.module';
import { MailModule } from './common/mail.module';
import { PushModule } from './common/push.module';
import { AuditModule } from './common/audit.module';
import { PrismaModule } from './prisma.module';

@Module({
  imports: [
    PrismaModule,
    PermissionsModule,
    PresenceModule,
    MailModule,
    PushModule,
    AuditModule,
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL_MS) || 60_000,
        limit: Number(process.env.THROTTLE_LIMIT) || 600,
      },
    ]),
    AuthModule,
    UsersModule,
    ChatsModule,
    MessagesModule,
    RealtimeModule,
    NotificationsModule,
    TasksModule,
    FilesModule,
    CalendarModule,
    AppsModule,
    DashboardModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: UserAwareThrottlerGuard,
    },
  ],
})
export class AppModule {}
