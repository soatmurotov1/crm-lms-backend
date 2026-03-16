import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { HomeworkResultsService } from './homework-results.service';
import { CreateHomeworkResultsDto } from './dto/create.results.dto';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { Roles } from 'src/common/guard/decarator.roles';

@Controller('homework-results')
@ApiBearerAuth()
export class HomeworkResultsController {
  constructor(private readonly homeworkResultService: HomeworkResultsService) {}

  @ApiOperation({
    summary: `${Role.ADMIN}, ${Role.SUPERADMIN}, ${Role.TEACHER}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER)
  @Post()
  createHomeworkResult(
    @Body() payload: CreateHomeworkResultsDto,
    @Req() req: Request,
  ) {
    return this.homeworkResultService.createHomeworkResult(
      payload,
      req['user'],
    );
  }

  @ApiOperation({
    summary: `${Role.ADMIN}, ${Role.SUPERADMIN}, ${Role.TEACHER}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER)
  @Get('homework/:homeworkId')
  getHomeworkResultByHomeworkId(
    @Param('homeworkId', ParseIntPipe) homeworkId: number,
    @Req() req: Request,
  ) {
    return this.homeworkResultService.getHomeworkResultsByHomeworkId(
      homeworkId,
      req['user'],
    );
  }

  @ApiOperation({
    summary: `${Role.ADMIN}, ${Role.SUPERADMIN}, ${Role.TEACHER}`,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.TEACHER)
  @Put(':id')
  updateHomeworkResult(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: CreateHomeworkResultsDto,
    @Req() req: Request
  ) {
    return this.homeworkResultService.updateHomeworkResult(
      { ...payload, id },
      req['user']
    );
  }
}
