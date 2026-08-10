import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { Roles } from 'src/common/guard/decarator.roles';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

@Controller('subscriptions')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @Get('all')
  getAll(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.subscriptionsService.getAll(
      req['user'],
      status,
      organizationId ? Number(organizationId) : undefined,
    );
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  // Butun platforma bo'yicha yig'indi (hamma markazning obunasi va summasi)
  // — faqat platforma egasiga. Ilgari tashkilot admini ham ko'ra olardi.
  @Roles(Role.SUPERADMIN)
  @Get('summary')
  getSummary() {
    return this.subscriptionsService.getSummary();
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}` })
  @Roles(Role.SUPERADMIN)
  @Post()
  create(@Body() payload: CreateSubscriptionDto) {
    return this.subscriptionsService.create(payload);
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}` })
  @Roles(Role.SUPERADMIN)
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: UpdateSubscriptionDto,
  ) {
    return this.subscriptionsService.update(id, payload);
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}` })
  @Roles(Role.SUPERADMIN)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.subscriptionsService.remove(id);
  }
}
