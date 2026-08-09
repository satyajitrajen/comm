import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppService } from './app.service';

@SkipThrottle()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('api/v1/health')
  health(): { ok: boolean } {
    return { ok: true };
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
