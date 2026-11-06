import { Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import {
  CurrentUser,
  type RequestUser,
} from 'src/common/guard/current-user.decorator';
import { ActiveBranch, V2AuthGuard } from '../common/v2-auth.guard';
import { V2Controller } from '../common/v2-controller.decorator';
import { V2SearchService } from './v2-search.service';

class V2SearchQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

@V2Controller('search')
@ApiBearerAuth()
@UseGuards(V2AuthGuard)
export class V2SearchController {
  constructor(private readonly searchService: V2SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Umumiy qidiruv: o‘quvchi, guruh, xodim' })
  search(
    @CurrentUser() user: RequestUser,
    @Query() query: V2SearchQueryDto,
    @ActiveBranch() branchId: number | null,
  ) {
    return this.searchService.search(user, query.q ?? '', branchId);
  }
}
