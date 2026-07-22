import { DocumentsQuery } from '@centro/shared';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export class QueryDocumentsDto extends PaginationQueryDto implements DocumentsQuery {}
