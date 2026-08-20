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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { TeachersService } from './teaches.service';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { CreateTeacherDto } from './dto/create.teachers.dto';
import { Roles } from 'src/common/guard/decarator.roles';
import {
  CurrentUser,
  type RequestUser,
} from 'src/common/guard/current-user.decorator';
import { UpdateTeachersDto } from './dto/update.teachers.dto';
import { ChangeTeacherPasswordDto } from './dto/change-teacher-password.dto';

@Controller('teachers')
@ApiBearerAuth()
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: { type: 'string' },
        phone: { type: 'string', example: '+998901234567' },
        password: { type: 'string' },
        position: { type: 'string' },
        experience: { type: 'number', example: 4 },
        photo: { type: 'string', format: 'binary', nullable: true },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @Post()
  createTeacher(
    @CurrentUser() user: RequestUser,
    @Body() payload: CreateTeacherDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.teachersService.createTeacher(user, payload, file);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.ADMINSTRATOR, Role.MANAGEMENT)
  @ApiOperation({
    summary: `${Role.SUPERADMIN}, ${Role.ADMIN}, ${Role.ADMINSTRATOR}, ${Role.MANAGEMENT}`,
  })
  @Get('all')
  getAllTeacher(
    @CurrentUser() user: RequestUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.teachersService.getAllTeachers(user, query);
  }

  @ApiOperation({ summary: `${Role.TEACHER}` })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('my/profile')
  getMyProfile(@CurrentUser() user: RequestUser) {
    return this.teachersService.getMyProfile(user);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.ADMINSTRATOR, Role.MANAGEMENT)
  @ApiOperation({
    summary: `${Role.SUPERADMIN}, ${Role.ADMIN}, ${Role.ADMINSTRATOR}, ${Role.MANAGEMENT}`,
  })
  @Get(':id')
  getOneTeacher(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.teachersService.getOneTeacher(user, +id);
  }

  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: { type: 'string' },
        phone: { type: 'string', example: '+998901234567' },
        password: { type: 'string' },
        position: { type: 'string' },
        experience: { type: 'number', example: 4 },
        photo: { type: 'string', format: 'binary', nullable: true },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @Put(':id')
  updateTeacherById(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: UpdateTeachersDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.teachersService.updateTeacherById(user, id, payload, file);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @Put(':id/archive')
  archiveTeacher(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.teachersService.toggleArchiveTeacher(user, id);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @Delete(':id')
  async deleteTeacher(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.teachersService.deleteTeacher(user, id);
  }

  @ApiOperation({ summary: `${Role.TEACHER}` })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Put('my/password')
  changeMyPassword(
    @CurrentUser() user: RequestUser,
    @Body() payload: ChangeTeacherPasswordDto,
  ) {
    return this.teachersService.changeMyPassword(user, payload);
  }
}
