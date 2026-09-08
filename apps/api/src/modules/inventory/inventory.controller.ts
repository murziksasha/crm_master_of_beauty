import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { InventoryService } from './inventory.service';
import {
  CreateProductCategoryDto,
  CreateProductDto,
  CreateSupplierDto,
  CreateSupplierInvoiceDto,
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

  @Get('products/barcode/:code')
  findByBarcode(@Param('code') code: string) {
    return this.inventoryService.findByBarcode(code);
  }

  @Get('suppliers')
  listSuppliers() {
    return this.inventoryService.listSuppliers();
  }

  @Post('suppliers')
  @Roles(Role.OWNER, Role.ADMIN)
  createSupplier(@Body() dto: CreateSupplierDto) {
    return this.inventoryService.createSupplier(dto);
  }

  @Get('invoices')
  listInvoices(@Headers('x-branch-id') branchHeader?: string) {
    return this.inventoryService.listInvoices(branchHeader);
  }

  @Post('invoices')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION)
  createInvoice(
    @Body() dto: CreateSupplierInvoiceDto,
    @CurrentUser('id') userId: string,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    return this.inventoryService.createInvoice(
      { ...dto, branchId: dto.branchId || branchHeader },
      userId,
    );
  }

  @Post('invoices/:id/paid')
  @Roles(Role.OWNER, Role.ADMIN)
  markPaid(@Param('id') id: string) {
    return this.inventoryService.markInvoicePaid(id);
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
