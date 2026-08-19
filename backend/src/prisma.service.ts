import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
    try {
      // Optimize SQLite for high concurrency multi-user network usage
      await this.$executeRawUnsafe(`PRAGMA journal_mode = WAL;`);
      await this.$executeRawUnsafe(`PRAGMA synchronous = NORMAL;`);
      await this.$executeRawUnsafe(`PRAGMA busy_timeout = 5000;`);
      await this.$executeRawUnsafe(`PRAGMA cache_size = -64000;`);
    } catch {
      // Ignore for non-SQLite environments
    }
  }
}
