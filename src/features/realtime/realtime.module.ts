import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MessagingModule } from '../messaging/messaging.module';
import { EventsGateway } from './events.gateway';

@Module({
  imports: [AuthModule, MessagingModule],
  providers: [EventsGateway],
})
export class RealtimeModule {}
