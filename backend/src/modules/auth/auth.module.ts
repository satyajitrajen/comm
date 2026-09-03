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
        expiresIn:
          (process.env.ACCESS_TOKEN_EXPIRES_IN?.trim() ||
            '365d') as `${number}${'s' | 'm' | 'h' | 'd' | 'w' | 'y'}`,
      },
    }),
  ],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
