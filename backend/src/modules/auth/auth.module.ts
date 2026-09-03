import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { getJwtSecret } from '../../config/jwt';

@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: {
        // Default only; AuthService overrides per-token via ACCESS_TOKEN_EXPIRES_IN.
        // Real session end is logout (LoginSession.isRevoked + JWT `sid` check).
        expiresIn: '365d',
      },
    }),
  ],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
