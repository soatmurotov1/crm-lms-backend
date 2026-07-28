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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { Roles } from 'src/common/guard/decarator.roles';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Controller('plans')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @Get('all')
  getAll(@Query('status') status?: string) {
    return this.plansService.getAll(status);
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.plansService.getOne(id);
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}` })
  @Roles(Role.SUPERADMIN)
  @Post()
  create(@Body() payload: CreatePlanDto) {
    return this.plansService.create(payload);
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}` })
  @Roles(Role.SUPERADMIN)
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: UpdatePlanDto,
  ) {
    return this.plansService.update(id, payload);
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}` })
  @Roles(Role.SUPERADMIN)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.plansService.remove(id);
  }
}
