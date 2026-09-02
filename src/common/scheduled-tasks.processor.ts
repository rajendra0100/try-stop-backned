import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';

import { RankingService } from '../ranking/ranking.service';
import { AdService } from '../ad/ad.service';

/**
 * ScheduledTasksProcessor — background worker consuming scheduled jobs from Redis.
 *
 * Runs tasks asynchronously on the queue worker thread, preventing main HTTP thread blockages.
 */
@Processor('scheduled-tasks')
export class ScheduledTasksProcessor {
  private readonly logger = new Logger(ScheduledTasksProcessor.name);

  constructor(
    private readonly rankingService: RankingService,
    private readonly adService: AdService,
  ) {}

  /**
   * Ranking Recomputation Job (Runs every 6 hours).
   */
  @Process('ranking-recompute')
  async handleRankingRecompute(job: Job): Promise<void> {
    const isManual = job.data?.manual === true;
    this.logger.log(`[Job ${job.id}] Ranking recomputation started (Manual: ${isManual})`);

    try {
      const result = await this.rankingService.recomputeAllRankings();
      this.logger.log(
        `[Job ${job.id}] Ranking complete — ${result.sellersProcessed} sellers in ${result.duration}ms`,
      );
    } catch (error) {
      this.logger.error(`[Job ${job.id}] Ranking recomputation failed`, error?.stack || error?.message || error);
      throw error;
    }
  }

  /**
   * Ad Expiry check (Runs hourly).
   */
  @Process('ad-expiry')
  async handleAdExpiry(job: Job): Promise<void> {
    this.logger.log(`[Job ${job.id}] Ad expiry check started`);

    try {
      const expired = await this.adService.expireOldAds();
      if (expired > 0) {
        this.logger.log(`[Job ${job.id}] Expired ${expired} ads`);
      }
    } catch (error) {
      this.logger.error(`[Job ${job.id}] Ad expiry check failed`, error?.stack || error?.message || error);
      throw error;
    }
  }
}
