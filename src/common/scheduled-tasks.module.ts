import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ScheduledTasksService } from './scheduled-tasks.service';

import { RankingModule } from '../ranking/ranking.module';
import { AdModule } from '../ad/ad.module';
import { ScheduledTasksProcessor } from './scheduled-tasks.processor';

/**
 * ScheduledTasksModule — manages distributed background tasks.
 *
 * Uses BullMQ + Redis to manage repeatable background jobs.
 * This guarantees tasks (like shop ranking updates and ad expiry)
 * run in cluster-safe background threads, never blocking the web server.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: 'scheduled-tasks' }),
    RankingModule,
    AdModule,
  ],
  providers: [ScheduledTasksService, ScheduledTasksProcessor],
  exports: [ScheduledTasksService],
})
export class ScheduledTasksModule {}
