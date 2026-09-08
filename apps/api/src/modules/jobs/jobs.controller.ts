import { Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JobsService } from './jobs.service';

/** Manual triggers for ops jobs (OWNER/ADMIN) — useful in dev */
@ApiTags('jobs')
@ApiBearerAuth()
@Controller('v1/jobs')
@Roles(Role.OWNER, Role.ADMIN)
export class JobsController {
  constructor(private jobs: JobsService) {}

  @Post('run-reminders')
  runReminders() {
    return this.jobs.processAppointmentReminders().then(() => ({ ok: true }));
  }

  @Post('run-daily')
  async runDaily() {
    const [staff, birthdays, lowStock, winback, reviews] = await Promise.all([
      this.jobs.sendStaffMorningDigests(),
      this.jobs.sendBirthdayGreetings(),
      this.jobs.sendLowStockAlert(),
      this.jobs.sendWinbackCampaigns(),
      this.jobs.sendReviewPolls(),
    ]);
    return { ok: true, staff, birthdays, lowStock, winback, reviews };
  }

  @Post('run-winback')
  runWinback() {
    return this.jobs.sendWinbackCampaigns();
  }

  @Post('run-reviews')
  runReviews() {
    return this.jobs.sendReviewPolls();
  }

  @Post('run-birthdays')
  runBirthdays() {
    return this.jobs.sendBirthdayGreetings();
  }

  @Post('run-low-stock')
  runLowStock() {
    return this.jobs.sendLowStockAlert();
  }
}
