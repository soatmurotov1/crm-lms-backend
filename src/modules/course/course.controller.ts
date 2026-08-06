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
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import { CourseService } from './course.service';
import { Role } from '@prisma/client';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { Roles } from 'src/common/guard/decarator.roles';
import {
  CurrentUser,
  RequestUser,
} from 'src/common/guard/current-user.decorator';

@Controller('course')
@ApiBearerAuth()
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.SUPERADMIN}` })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Get('all')
  getAllCourse(
    @CurrentUser() user: RequestUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.courseService.getAllCourse(user, query);
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.SUPERADMIN}` })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Post()
  createCourse(
    @CurrentUser() user: RequestUser,
    @Body() payload: CreateCourseDto,
  ) {
    return this.courseService.createCourse(user, payload);
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.SUPERADMIN}` })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Get(':id')
  getOneCourse(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.courseService.getOneCourse(user, id);
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.SUPERADMIN}` })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Put(':id')
  updateCourseById(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: UpdateCourseDto,
  ) {
    return this.courseService.updateCourseById(user, id, payload);
  }

  @ApiOperation({ summary: `${Role.ADMIN}, ${Role.SUPERADMIN}` })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Delete(':id')
  deleteCourseById(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.courseService.deleteCourseById(user, id);
  }
}
