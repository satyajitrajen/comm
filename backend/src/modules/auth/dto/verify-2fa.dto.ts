import { IsString, MinLength, MaxLength } from 'class-validator';

export class Verify2FaDto {
  @IsString()
  @MinLength(3)
  @MaxLength(320)
  verifyKey: string;

  @IsString()
  @MinLength(4)
  @MaxLength(12)
  otpCode: string;
}
