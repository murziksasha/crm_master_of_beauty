import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { BranchesService, CreateBranchDto, UpdateBranchDto } from './branches.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('branches')
@Controller('v1/branches')
export class BranchesController {
  constructor(private branchesService: BranchesService) {}

  @Public()
  @Get('public')
  listPublic() {
    return this.branchesService.list(true);
  }

  @ApiBearerAuth()
  @Get()
  list(@Query('all') all?: string) {
    return this.branchesService.list(all !== '1');
  }

  @ApiBearerAuth()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.branchesService.findOne(id);
  }

  @ApiBearerAuth()
  @Post()
  @Roles(Role.OWNER, Role.ADMIN)
  create(@Body() dto: CreateBranchDto) {
    return this.branchesService.create(dto);
  }

  @ApiBearerAuth()
  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.branchesService.update(id, dto);
  }
}
