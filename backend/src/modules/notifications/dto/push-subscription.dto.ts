import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MAX_PUSH_TOKEN_LENGTH } from '../../../common/push-token.util';

export class PushSubscribeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_PUSH_TOKEN_LENGTH)
  token?: string;

  @IsOptional()
  @IsObject()
  subscription?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['WEB', 'ANDROID', 'IOS'])
  deviceType?: 'WEB' | 'ANDROID' | 'IOS';
}

export class PushUnsubscribeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_PUSH_TOKEN_LENGTH)
  token?: string;

  @IsOptional()
  @IsObject()
  subscription?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['WEB', 'ANDROID', 'IOS'])
  deviceType?: 'WEB' | 'ANDROID' | 'IOS';
}
