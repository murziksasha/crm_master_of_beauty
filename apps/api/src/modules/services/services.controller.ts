import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ServicesService } from './services.service';
import {
  CreateCategoryDto,
  CreateServiceDto,
  SetServiceMaterialsDto,
  UpdateCategoryDto,
  UpdateServiceDto,
} from './dto/service.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('services')
@ApiBearerAuth()
@Controller('v1/services')
export class ServicesController {
  constructor(private servicesService: ServicesService) {}

  @Get('categories')
  listCategories(@Query('all') all?: string) {
    return this.servicesService.listCategories(all === '1');
  }

  @Post('categories')
  @Roles(Role.OWNER, Role.ADMIN)
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.servicesService.createCategory(dto);
  }

  @Patch('categories/:id')
  @Roles(Role.OWNER, Role.ADMIN)
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.servicesService.updateCategory(id, dto);
  }

  @Get()
  listServices() {
    return this.servicesService.listServices();
  }

  @Get(':id/materials')
  getMaterials(@Param('id') id: string) {
    return this.servicesService.getMaterials(id);
  }

  @Put(':id/materials')
  @Roles(Role.OWNER, Role.ADMIN)
  setMaterials(@Param('id') id: string, @Body() dto: SetServiceMaterialsDto) {
    return this.servicesService.setMaterials(id, dto.materials || []);
  }

  @Get(':id')
  getService(@Param('id') id: string) {
    return this.servicesService.getService(id);
  }

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION)
  createService(@Body() dto: CreateServiceDto) {
    return this.servicesService.createService(dto);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION)
  updateService(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.servicesService.updateService(id, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  removeService(@Param('id') id: string) {
    return this.servicesService.removeService(id);
  }
}
