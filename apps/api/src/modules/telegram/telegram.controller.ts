import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { TelegramService } from './telegram.service';

@ApiTags('telegram')
@Controller('v1/public/telegram')
export class TelegramController {
  constructor(private telegram: TelegramService) {}

  @Public()
  @Post('webhook')
  webhook(@Body() body: unknown) {
    return this.telegram.handleUpdate(body as never);
  }
}
