import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateRoomDto, RoomsService, UpdateRoomDto } from './rooms.service';

@ApiTags('rooms')
@ApiBearerAuth()
@Controller('v1/rooms')
export class RoomsController {
  constructor(private rooms: RoomsService) {}

  @Get()
  list(
    @Query('all') all?: string,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    return this.rooms.list(branchHeader, all === '1');
  }

  @Post()
  @Roles(Role.OWNER, Role.ADMIN)
  create(
    @Body() dto: CreateRoomDto,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    return this.rooms.create({ ...dto, branchId: dto.branchId || branchHeader });
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateRoomDto) {
    return this.rooms.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.rooms.remove(id);
  }
}
