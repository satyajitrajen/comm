import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class AdminCreateUserDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string | null;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  department?: string | null;

  @IsOptional()
  @IsString()
  statusAvailability?: string;

  @IsOptional()
  @IsString()
  aboutText?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AdminUpdateUserDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string | null;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  department?: string | null;

  @IsOptional()
  @IsString()
  statusAvailability?: string;

  @IsOptional()
  @IsString()
  aboutText?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ImportUsersDto {
  @IsString()
  @IsNotEmpty()
  csv: string;
}

export class UpdateApprovalCycleDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsNumber()
  requiredApprovals?: number;

  @IsOptional()
  @IsString()
  approverRole?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  appliesTo?: string[];

  @IsOptional()
  @IsBoolean()
  autoApproveAdmins?: boolean;

  @IsOptional()
  @IsNumber()
  escalationHours?: number;
}
