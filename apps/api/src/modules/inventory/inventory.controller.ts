import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { InventoryService } from './inventory.service';
import {
  CreateProductCategoryDto,
  CreateProductDto,
  StockMoveDto,
  UpdateProductDto,
} from './dto/inventory.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('v1/inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Get('categories')
  listCategories() {
    return this.inventoryService.listCategories();
  }

  @Post('categories')
  @Roles(Role.OWNER, Role.ADMIN)
  createCategory(@Body() dto: CreateProductCategoryDto) {
    return this.inventoryService.createCategory(dto);
  }

  @Get('products')
  listProducts(
    @Query('search') search?: string,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    return this.inventoryService.listProducts(search, branchHeader);
  }

  @Get('low-stock')
  lowStock(@Headers('x-branch-id') branchHeader?: string) {
    return this.inventoryService.lowStock(branchHeader);
  }

  @Post('products')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION)
  createProduct(
    @Body() dto: CreateProductDto,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    return this.inventoryService.createProduct({
      ...dto,
      branchId: dto.branchId || branchHeader,
    });
  }

  @Patch('products/:id')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION)
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.inventoryService.updateProduct(id, dto);
  }

  @Delete('products/:id')
  @Roles(Role.OWNER, Role.ADMIN)
  removeProduct(@Param('id') id: string) {
    return this.inventoryService.removeProduct(id);
  }

  @Post('products/:id/move')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION)
  moveStock(
    @Param('id') id: string,
    @Body() dto: StockMoveDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.inventoryService.moveStock(id, dto, userId);
  }
}
