import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';

interface ScheduledJobDef {
  name: string;
  cron: string;
}

const SCHEDULED_JOBS: ScheduledJobDef[] = [
  { name: 'ranking-recompute', cron: '0 */6 * * *' }, // Every 6 hours
  { name: 'ad-expiry', cron: '0 * * * *' },          // Every hour
];

/**
 * ScheduledTasksService — registers and synchronizes repeatable background jobs.
 *
 * Automatically keeps Redis repeatable jobs in sync with SCHEDULED_JOBS:
 * - Drops obsolete/changed cron jobs from Redis
 * - Registers current active jobs
 */
@Injectable()
export class ScheduledTasksService implements OnModuleInit {
  private readonly logger = new Logger(ScheduledTasksService.name);

  constructor(
    @InjectQueue('scheduled-tasks') private readonly scheduledTasksQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.syncRepeatableJobs();
  }

  /**
   * Synchronizes repeatable jobs in Redis with SCHEDULED_JOBS.
   */
  private async syncRepeatableJobs() {
    try {
      const existingJobs = await this.scheduledTasksQueue.getRepeatableJobs();

      // Remove jobs from Redis that are no longer defined or have an outdated cron
      for (const existing of existingJobs) {
        const matchingDef = SCHEDULED_JOBS.find(
          (job) => job.name === existing.name && job.cron === existing.cron,
        );
        if (!matchingDef) {
          await this.scheduledTasksQueue.removeRepeatableByKey(existing.key);
          this.logger.log(`Removed obsolete repeatable job from Redis: ${existing.name} (${existing.cron})`);
        }
      }

      // Register or update active jobs
      for (const jobDef of SCHEDULED_JOBS) {
        await this.scheduledTasksQueue.add(
          jobDef.name,
          {},
          {
            repeat: { cron: jobDef.cron },
            removeOnComplete: true,
            removeOnFail: false,
          },
        );
        this.logger.log(`Registered scheduled job: ${jobDef.name} (cron: ${jobDef.cron})`);
      }
    } catch (error) {
      this.logger.error('Failed to sync scheduled repeatable jobs', error?.message);
    }
  }

  /**
   * Helper to manually trigger ranking recomputation immediately.
   */
  async triggerRankingManual() {
    return this.scheduledTasksQueue.add('ranking-recompute', { manual: true });
  }
}
