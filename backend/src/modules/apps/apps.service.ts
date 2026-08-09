import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

const DEFAULT_APPS = [
  {
    name: 'teamtime.live',
    category: 'Communication',
    description:
      'Sleek and unified workspace communication platform for messaging, files, and high-fidelity video calls.',
    isConnected: true,
  },
  {
    name: 'it.imperativepulse.in',
    category: 'Operations',
    description:
      'Central IT management hub and operations dashboard for tracking infrastructure status and developer tooling.',
    isConnected: true,
  },
  {
    name: 'spendmint.ibvl.in',
    category: 'Finance',
    description:
      'Smart financial management and expense tracking portal for corporate teams, billing, and budgeting.',
    isConnected: true,
  },
  {
    name: 'kagazhub.ibvl.in',
    category: 'Documentation',
    description:
      'Secure cloud document repository and collaboration workspace for team knowledgebases and records.',
    isConnected: true,
  },
];

@Injectable()
export class AppsService {
  constructor(private prisma: PrismaService) {}

  private async getWorkspaceId(userId: string) {
    const workspaceUser = await this.prisma.workspaceUser.findFirst({
      where: { userId, isActive: true },
    });

    if (!workspaceUser) {
      throw new ForbiddenException('User is not part of an active workspace');
    }

    return workspaceUser.workspaceId;
  }

  private async ensureDefaultApps(workspaceId: string) {
    const targetNames = DEFAULT_APPS.map((a) => a.name);

    // Remove obsolete apps not in the configured list
    await this.prisma.appIntegration.deleteMany({
      where: {
        workspaceId,
        name: { notIn: targetNames },
      },
    });

    // Ensure each configured app exists with updated metadata
    for (const app of DEFAULT_APPS) {
      await this.prisma.appIntegration.upsert({
        where: {
          workspaceId_name: {
            workspaceId,
            name: app.name,
          },
        },
        create: {
          workspaceId,
          name: app.name,
          category: app.category,
          description: app.description,
          isConnected: app.isConnected,
        },
        update: {
          category: app.category,
          description: app.description,
        },
      });
    }
  }

  async getApps(userId: string) {
    const workspaceId = await this.getWorkspaceId(userId);
    await this.ensureDefaultApps(workspaceId);

    return await this.prisma.appIntegration.findMany({
      where: { workspaceId },
      orderBy: [{ isConnected: 'desc' }, { name: 'asc' }],
    });
  }

  async toggleApp(userId: string, id: string) {
    const workspaceId = await this.getWorkspaceId(userId);
    const app = await this.prisma.appIntegration.findFirst({
      where: { id, workspaceId },
    });

    if (!app) {
      throw new NotFoundException('App integration not found');
    }

    return await this.prisma.appIntegration.update({
      where: { id },
      data: { isConnected: !app.isConnected },
    });
  }
}
