import { IsString, IsUUID, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @IsUUID('4')
  sessionId: string;

  @IsString()
  @MinLength(16)
  refreshToken: string;
}

export class LogoutDto {
  @IsUUID('4')
  sessionId: string;

  @IsString()
  @MinLength(16)
  refreshToken: string;
}
