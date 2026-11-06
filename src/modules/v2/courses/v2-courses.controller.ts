import {
  Body,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  CurrentUser,
  type RequestUser,
} from 'src/common/guard/current-user.decorator';
import {
  ActiveBranch,
  CurrentActor,
  V2AuthGuard,
  V2Permission,
  V2Roles,
  type V2Actor,
} from '../common/v2-auth.guard';
import { V2Controller } from '../common/v2-controller.decorator';
import { parseId } from '../common/v2.mapper';
import {
  V2CoursesQueryDto,
  V2CreateCourseDto,
  V2UpdateCourseDto,
} from './v2-courses.dto';
import { V2CoursesService } from './v2-courses.service';

const MANAGERS = ['dev', 'owner', 'manager'] as const;

@V2Controller('courses')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
export class V2CoursesController {
  constructor(private readonly courses: V2CoursesService) {}

  @Get()
  @ApiOperation({ summary: 'Kurslar ro‘yxati' })
  list(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2CoursesQueryDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.courses.list(user, actor, query, branchId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Kurs' })
  detail(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.courses.detail(user, parseId(id, 'Kurs'));
  }

  @Post()
  @V2Roles(...MANAGERS)
  @V2Permission('courses.create')
  @ApiOperation({ summary: 'Kurs yaratish' })
  create(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Body() payload: V2CreateCourseDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.courses.create(user, actor, payload, branchId);
  }

  @Patch(':id')
  @V2Roles(...MANAGERS)
  @V2Permission('courses.update')
  @ApiOperation({ summary: 'Kursni tahrirlash' })
  update(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2UpdateCourseDto,
  ) {
    return this.courses.update(user, actor, parseId(id, 'Kurs'), payload);
  }

  @Delete(':id')
  @HttpCode(204)
  @V2Roles(...MANAGERS)
  @V2Permission('courses.delete')
  @ApiOperation({ summary: 'Kursni o‘chirish' })
  remove(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.courses.remove(user, actor, parseId(id, 'Kurs'));
  }
}
