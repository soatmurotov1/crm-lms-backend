import {
  Body,
  Controller,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { HomeworkResponseService } from './homework-response.service';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthGuard } from 'src/common/guard/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/roles.guard';
import { Roles } from 'src/common/guard/decarator.roles';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CreateHomeworkResponseDto } from './dto/create.response.dto';

@Controller('homework-response')
@ApiBearerAuth()
export class HomeworkResponseController {
  constructor(
    private readonly homeworkResponseService: HomeworkResponseService,
  ) {}

  @ApiOperation({ summary: `${Role.STUDENT}` })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        homeworkId: { type: 'number' },
        file: { type: 'string', format: 'binary', nullable: true },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
    }),
  )
  @Post()
  createHomeworkResponse(
    @Body() payload: CreateHomeworkResponseDto,
    @Req() req: Request,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.homeworkResponseService.createHomeworkResponse(
      payload,
      req['user'],
      file,
    );
  }

  @ApiOperation({ summary: `${Role.STUDENT}` })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        homeworkId: { type: 'number' },
        file: { type: 'string', format: 'binary', nullable: true },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
    }),
  )
  @Put()
  updateHomeworkResponse(
    @Body() payload: CreateHomeworkResponseDto,
    @Req() req: Request,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.homeworkResponseService.updateHomeworkResponse(
      payload,
      req['user'],
      file,
    );
  }
}
