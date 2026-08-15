import { Controller, Headers, Query, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { RealtimeService } from './realtime.service';

@ApiTags('realtime')
@ApiBearerAuth()
@Controller('v1/realtime')
export class RealtimeController {
  constructor(private realtime: RealtimeService) {}

  @Sse('stream')
  stream(
    @Headers('x-branch-id') branchHeader?: string,
    @Query('branchId') branchQuery?: string,
  ): Observable<{ data: unknown }> {
    return this.realtime.stream(branchHeader || branchQuery || null);
  }
}
