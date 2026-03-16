import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { StudentsService } from './students.service';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { CreateStudentDto } from './dto/create.students.dto';
import { Roles } from 'src/common/guard/decarator.roles';
import { UpdateStudentDto } from './dto/update.students.dto';

@Controller('students')
@ApiBearerAuth()
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @ApiOperation({summary: `${Role.STUDENT}`})
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get("my/groups")
  GetMyGroups(
    @Req() req: Request
  ){
    return this.studentsService.getMyGroups(req["user"])
  }

  @ApiOperation({summary: `${Role.STUDENT}`})
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get("my/group/lessonVideo/:groupId")
  GetMyGroupLessonVideo(
    @Param("groupId", ParseIntPipe) groupId: number,
    @Req() req: Request
  ){
    return this.studentsService.getMyGroupLessonVideo(groupId, req["user"])
  }


  @ApiOperation({summary: `${Role.STUDENT}`})
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get("my/lessons/:groupId")
  GetMyLessons(
    @Param("groupId", ParseIntPipe) groupId: number,
    @Req() req: Request
  ){
    return this.studentsService.getMyLessons(groupId, req["user"])
  }

  @ApiOperation({summary: `${Role.STUDENT}`})
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get("my/group/homework/:groupId")
  GetMyGroupsHomework(
    @Param("groupId", ParseIntPipe) groupId: number,
    @Query("lessonId", ParseIntPipe) lessonId: number,
    @Req() req: Request
  ){
    return this.studentsService.getMyGroupHomework(groupId, lessonId, req["user"])
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: { type: 'string' },
        email: { type: 'string' },
        password: { type: 'string' },
        birth_date: { type: 'string', example: '2026-01-02' },
        photo: { type: 'string', format: 'binary', nullable: true }
      }
    }
  })
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage()
    })
  )
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Post()
  createStudent(
    @Body() payload: CreateStudentDto,
    @UploadedFile() file?: Express.Multer.File
  ) {
    return this.studentsService.createStudent(payload, file)
  }

  @ApiOperation({summary: `${Role.ADMIN}, ${Role.SUPERADMIN}`})
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Get('all')
  getAllStudent() {
    return this.studentsService.getAllStudents();
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Get(':id')
  getOneStudent(@Param('id') id: string) {
    return this.studentsService.getOneStudent(+id)
  }

  @ApiOperation({ summary: `${Role.SUPERADMIN}, ${Role.ADMIN}` })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: { type: 'string' },
        email: { type: 'string' },
        password: { type: 'string' },
        birth_date: { type: 'string', example: '2026-01-02' },
        photo: { type: 'string', format: 'binary', nullable: true }
      }
    }
  })
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage()
    })
  )
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Put(':id')
  updateStudent(
    @Param('id') id: string,
    @Body() payload: UpdateStudentDto,
    @UploadedFile() file?: Express.Multer.File
  ) {
    return this.studentsService.updateStudentById(+id, payload, file)
  }

  @ApiOperation({summary: `${Role.STUDENT}`})
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get("my/profile")
  getMyProfile(
    @Req() req: Request
  ){
    return this.studentsService.getMyProfile(req["user"]) 
  }

  @ApiOperation({summary: `${Role.ADMIN}, ${Role.SUPERADMIN}`})
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Delete(":studentId")
  deleteStudentById(
    @Param("studentId", ParseIntPipe) studentId: number,
    @Req() req: Request
  ){
    return this.studentsService.deleteStudentById(studentId,  req["user"]) 
  }
}
