import { Controller, UseFilters, applyDecorators } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { V2ExceptionFilter } from './v2-exception.filter';

/** `/api/v2/<path>` ostidagi kontroller, frontend kutgan xato shakli bilan. */
export const V2Controller = (path: string) =>
  applyDecorators(
    Controller(`v2/${path}`),
    UseFilters(V2ExceptionFilter),
    ApiTags(`v2 / ${path}`),
  );
