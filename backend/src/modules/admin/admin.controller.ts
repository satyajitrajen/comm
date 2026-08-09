import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminService } from './admin.service';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('users')
  async listUsers(@CurrentUserId() userId: string) {
    return await this.adminService.listUsers(userId);
  }

  @Post('users')
  async createUser(
    @CurrentUserId() userId: string,
    @Body()
    body: {
      email?: string;
      phoneNumber?: string | null;
      password?: string;
      displayName?: string;
      role?: string;
      department?: string | null;
      statusAvailability?: string;
      aboutText?: string;
      isActive?: boolean;
    },
  ) {
    return await this.adminService.createUser(userId, body);
  }

  @Patch('users/:targetUserId')
  async updateUser(
    @CurrentUserId() userId: string,
    @Param('targetUserId') targetUserId: string,
    @Body()
    body: {
      email?: string;
      phoneNumber?: string | null;
      password?: string;
      displayName?: string;
      role?: string;
      department?: string | null;
      statusAvailability?: string;
      aboutText?: string;
      avatarUrl?: string | null;
      isActive?: boolean;
    },
  ) {
    return await this.adminService.updateUser(userId, targetUserId, body);
  }

  @Post('users/import')
  async importUsers(
    @CurrentUserId() userId: string,
    @Body() body: { csv: string },
  ) {
    return await this.adminService.importUsersFromCsv(userId, body.csv);
  }

  @Get('users/import-template')
  importTemplate(@CurrentUserId() userId: string) {
    void userId;
    return { csv: this.adminService.csvImportTemplate() };
  }

  @Get('audit-log')
  async getAuditLog(
    @CurrentUserId() userId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    const parsedLimit = Number(limit);
    return await this.adminService.listAuditLog(userId, {
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      before,
    });
  }

  @Get('settings/approval-cycle')
  async getApprovalCycle(@CurrentUserId() userId: string) {
    return await this.adminService.getApprovalCycle(userId);
  }

  @Patch('settings/approval-cycle')
  async updateApprovalCycle(
    @CurrentUserId() userId: string,
    @Body()
    body: {
      enabled?: boolean;
      requiredApprovals?: number;
      approverRole?: string;
      appliesTo?: string[];
      autoApproveAdmins?: boolean;
      escalationHours?: number;
    },
  ) {
    return await this.adminService.updateApprovalCycle(userId, body);
  }

  @Get('settings/role-permissions')
  async getRolePermissions(@CurrentUserId() userId: string) {
    return await this.adminService.getRolePermissions(userId);
  }

  @Patch('settings/role-permissions')
  async updateRolePermissions(
    @CurrentUserId() userId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return await this.adminService.updateRolePermissions(userId, body);
  }
}
