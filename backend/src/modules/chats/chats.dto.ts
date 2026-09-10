import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateDirectChatDto {
  @IsString()
  @IsNotEmpty()
  targetUserId: string;
}

export class CreateGroupChatDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  participantIds: string[];

  @IsOptional()
  @IsString()
  teamName?: string;

  @IsOptional()
  @IsString()
  channelSlug?: string;

  @IsOptional()
  @IsString()
  spaceType?: string;

  @IsOptional()
  @IsBoolean()
  isReadOnly?: boolean;
}

export class UpdateGroupChatDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  teamName?: string;

  @IsOptional()
  @IsString()
  spaceType?: string;

  @IsOptional()
  @IsBoolean()
  isReadOnly?: boolean;
}

export class AddGroupMembersDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  userIds: string[];
}

export class UpdateMemberRoleDto {
  @IsString()
  @IsNotEmpty()
  role: string;
}
