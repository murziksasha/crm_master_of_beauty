import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { StaffService } from './staff.service';
import { CreateStaffDto, TimeOffDto, UpdateStaffDto } from './dto/staff.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('staff')
@ApiBearerAuth()
@Controller('v1/staff')
export class StaffController {
  constructor(private staffService: StaffService) {}

  @Get()
  async list(
    @Query('branchId') branchId?: string,
    @Headers('x-branch-id') branchHeader?: string,
    @CurrentUser() user?: { role: Role; staffProfileId?: string | null },
  ) {
    if (user?.role === Role.MASTER) {
      if (!user.staffProfileId) throw new ForbiddenException('Профіль майстра не привʼязано');
      const me = await this.staffService.findOne(user.staffProfileId);
      return [me];
    }
    return this.staffService.list(branchId || branchHeader);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user?: { role: Role; staffProfileId?: string | null },
  ) {
    if (user?.role === Role.MASTER && user.staffProfileId !== id) {
      throw new ForbiddenException('Немає доступу');
    }
    return this.staffService.findOne(id);
  }

  @Post()
  @Roles(Role.OWNER, Role.ADMIN)
  create(@Body() dto: CreateStaffDto) {
    return this.staffService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.staffService.update(id, dto);
  }

  @Post(':id/time-off')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION)
  addTimeOff(@Param('id') id: string, @Body() dto: TimeOffDto) {
    return this.staffService.addTimeOff(id, dto);
  }

  @Delete(':id/time-off/:timeOffId')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION)
  removeTimeOff(@Param('id') id: string, @Param('timeOffId') timeOffId: string) {
    return this.staffService.removeTimeOff(id, timeOffId);
  }
}
