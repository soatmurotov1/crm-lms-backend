import {
  Body,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation } from '@nestjs/swagger';
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
import { MAX_UPLOAD_BYTES, type UploadedBlob } from '../common/v2-files.service';
import { parseId } from '../common/v2.mapper';
import {
  V2CreateDocumentDto,
  V2DocumentsQueryDto,
  V2UpdateDocumentDto,
} from './v2-documents.dto';
import { V2DocumentsService } from './v2-documents.service';

const WRITERS = ['dev', 'owner', 'manager', 'operator'] as const;

@V2Controller('documents')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
@V2Roles('dev', 'owner', 'manager', 'operator', 'teacher', 'accountant')
export class V2DocumentsController {
  constructor(private readonly documents: V2DocumentsService) {}

  @Get()
  @V2Permission('documents.read')
  @ApiOperation({ summary: 'Hujjatlar ro‘yxati' })
  list(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Query() query: V2DocumentsQueryDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.documents.list(user, actor, query, branchId);
  }

  @Get(':id')
  @V2Permission('documents.read')
  @ApiOperation({ summary: 'Hujjat' })
  detail(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.documents.detail(user, actor, parseId(id, 'Hujjat'));
  }

  @Get(':id/download')
  @V2Permission('documents.read')
  @ApiOperation({ summary: 'Hujjat faylini yuklab olish' })
  download(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.documents.download(user, actor, parseId(id, 'Hujjat'));
  }

  @Post()
  @V2Roles(...WRITERS)
  @V2Permission('documents.create')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  @ApiOperation({ summary: 'Hujjat yuklash' })
  create(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Body() payload: V2CreateDocumentDto,
    @UploadedFile() file: UploadedBlob | undefined,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.documents.create(user, actor, payload, file, branchId);
  }

  @Patch(':id')
  @V2Roles(...WRITERS)
  @V2Permission('documents.update')
  @ApiOperation({ summary: 'Hujjatni tahrirlash' })
  update(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
    @Body() payload: V2UpdateDocumentDto,
  ) {
    return this.documents.update(user, actor, parseId(id, 'Hujjat'), payload);
  }

  @Delete(':id')
  @HttpCode(204)
  @V2Roles('dev', 'owner', 'manager')
  @V2Permission('documents.delete')
  @ApiOperation({ summary: 'Hujjatni o‘chirish' })
  remove(
    @CurrentUser() user: RequestUser,
    @CurrentActor() actor: V2Actor,
    @Param('id') id: string,
  ) {
    return this.documents.remove(user, actor, parseId(id, 'Hujjat'));
  }
}
