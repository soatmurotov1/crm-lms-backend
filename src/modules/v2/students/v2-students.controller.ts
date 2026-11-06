import {
  Body,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
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
  V2CreateStudentDto,
  V2LearnerAccountDto,
  V2StudentsQueryDto,
  V2UpdateStudentDto,
} from './v2-students.dto';
import { V2StudentsService } from './v2-students.service';

/** O'quvchilarni boshqaradigan rollar. */
const OPS = ['dev', 'owner', 'manager', 'operator'] as const;

@V2Controller('students')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
export class V2StudentsController {
  constructor(private readonly students: V2StudentsService) {}

  @Get()
  @V2Permission('students.read')
  @ApiOperation({ summary: 'O‘quvchilar ro‘yxati' })
  list(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2StudentsQueryDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.students.list(user, actor, query, branchId);
  }

  @Get(':id')
  @V2Permission('students.read')
  @ApiOperation({ summary: 'O‘quvchi kartochkasi' })
  detail(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.students.detail(user, actor, parseId(id, 'O‘quvchi'));
  }

  @Post()
  @V2Roles(...OPS)
  @V2Permission('students.create')
  @ApiOperation({ summary: 'O‘quvchini ro‘yxatga olish (boshlang‘ich to‘lov bilan)' })
  create(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Body() payload: V2CreateStudentDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.students.create(user, actor, payload, branchId);
  }

  @Patch(':id/restore')
  @HttpCode(204)
  @V2Roles('dev', 'owner')
  @V2Permission('students.restore')
  @ApiOperation({ summary: 'O‘chirilgan o‘quvchini tiklash' })
  restore(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.students.restore(user, actor, parseId(id, 'O‘quvchi'));
  }

  @Put(':id/learner-account')
  @V2Roles(...OPS)
  @V2Permission('students.update')
  @ApiOperation({ summary: 'O‘quvchi portali parolini o‘rnatish' })
  learnerAccount(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2LearnerAccountDto,
  ) {
    return this.students.upsertLearnerAccount(
      user,
      actor,
      parseId(id, 'O‘quvchi'),
      payload.password,
    );
  }

  @Patch(':id')
  @V2Roles(...OPS)
  @V2Permission('students.update')
  @ApiOperation({ summary: 'O‘quvchini tahrirlash (qo‘shimcha to‘lov bilan)' })
  update(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2UpdateStudentDto,
  ) {
    return this.students.update(user, actor, parseId(id, 'O‘quvchi'), payload);
  }

  @Delete(':id')
  @HttpCode(204)
  @V2Roles('dev', 'owner', 'manager')
  @V2Permission('students.delete')
  @ApiOperation({ summary: 'O‘quvchini o‘chirish' })
  remove(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.students.remove(user, actor, parseId(id, 'O‘quvchi'));
  }
}
