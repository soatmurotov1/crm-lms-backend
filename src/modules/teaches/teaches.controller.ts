import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
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
        email: { type: 'string' },
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
    }),
  )
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @Post()
  createTeacher(
    @Body() payload: CreateTeacherDto,
    @UploadedFile() file?: Express.Multer.File,
    @Req() req?: Request,
  ) {
    const creatorEmail =
      req?.['user']?.email || process.env.DEFAULT_EMAIL || 'admin@example.com';
    return this.teachersService.createTeacher(payload, creatorEmail, file);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.ADMINSTRATOR, Role.MANAGEMENT)
  @ApiOperation({
    summary: `${Role.SUPERADMIN}, ${Role.ADMIN}, ${Role.ADMINSTRATOR}, ${Role.MANAGEMENT}`,
  })
  @Get('all')
  getAllTeacher() {
    return this.teachersService.getAllTeachers();
  }

  @ApiOperation({ summary: `${Role.TEACHER}` })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('my/profile')
  getMyProfile(@Req() req: Request) {
    return this.teachersService.getMyProfile(req['user']);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.ADMINSTRATOR, Role.MANAGEMENT)
  @ApiOperation({
    summary: `${Role.SUPERADMIN}, ${Role.ADMIN}, ${Role.ADMINSTRATOR}, ${Role.MANAGEMENT}`,
  })
  @Get(':id')
  getOneTeacher(@Param('id') id: string) {
    return this.teachersService.getOneTeacher(+id);
  }

  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: { type: 'string' },
        email: { type: 'string' },
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
    }),
  )
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @Put(':id')
  updateTeacherById(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: UpdateTeachersDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.teachersService.updateTeacherById(id, payload, file);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @Put(':id/archive')
  archiveTeacher(@Param('id', ParseIntPipe) id: number) {
    return this.teachersService.toggleArchiveTeacher(id);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @Delete(':id')
  async deleteTeacher(@Param('id', ParseIntPipe) id: number) {
    return this.teachersService.deleteTeacher(id);
  }

  @ApiOperation({ summary: `${Role.TEACHER}` })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Put('my/password')
  changeMyPassword(
    @Req() req: Request,
    @Body() payload: ChangeTeacherPasswordDto,
  ) {
    return this.teachersService.changeMyPassword(req['user'], payload);
  }
}
