import { Controller, Get } from '@nestjs/common';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { AllowAnonymous, Session } from '@thallesp/nestjs-better-auth';

@Controller('users')
export class UsersController {
  @Get('session')
  getSession(@Session() session: UserSession) {
    return session.user;
  }

  @Get('public')
  @AllowAnonymous()
  getPublic() {
    return true;
  }
}
