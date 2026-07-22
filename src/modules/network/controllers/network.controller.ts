import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { NetworkService } from '../services/network.service';
import { CreateNetworkDto } from '../dto/create-network.dto';
import { UpdateNetworkDto } from '../dto/update-network.dto';
import { NetworkQueryDto } from '../dto/network-query.dto';
import { NetworkResponseDto } from '../dto/network-response.dto';
import { ParsePositiveIntPipe } from '@common/pipes/parse-positive-int.pipe';

/**
 * REST endpoints for the Network Module.
 *
 * This controller is intentionally thin: it delegates every operation to
 * `NetworkService` without adding business logic, conditional branching,
 * or direct repository access.
 *
 * Auth guards (ADMIN/OPERATOR roles) will be wired in a later phase
 * once the Auth Module is implemented.
 */
@ApiTags('networks')
@Controller('networks')
export class NetworkController {
  public constructor(private readonly networkService: NetworkService) {}

  @ApiOperation({ summary: 'List all networks' })
  @ApiOkResponse({ description: 'Paginated list of networks' })
  @Get()
  public findAll(@Query() query: NetworkQueryDto) {
    return this.networkService.findAll(query);
  }

  @ApiOperation({ summary: 'Get a network by ID' })
  @ApiOkResponse({ type: NetworkResponseDto })
  @ApiNotFoundResponse({ description: 'Network not found' })
  @Get(':id')
  public findById(@Param('id') id: string) {
    return this.networkService.findById(id);
  }

  @ApiOperation({ summary: 'Get a network by slug' })
  @ApiOkResponse({ type: NetworkResponseDto })
  @ApiNotFoundResponse({ description: 'Network not found' })
  @Get('slug/:slug')
  public findBySlug(@Param('slug') slug: string) {
    return this.networkService.findBySlug(slug);
  }

  @ApiOperation({ summary: 'Register a new network' })
  @ApiCreatedResponse({ type: NetworkResponseDto })
  @Post()
  public create(@Body() dto: CreateNetworkDto) {
    return this.networkService.create(dto);
  }

  @ApiOperation({ summary: 'Update a network' })
  @ApiOkResponse({ type: NetworkResponseDto })
  @ApiNotFoundResponse({ description: 'Network not found' })
  @Patch(':id')
  public update(@Param('id') id: string, @Body() dto: UpdateNetworkDto) {
    return this.networkService.update(id, dto);
  }

  @ApiOperation({ summary: 'Activate a network' })
  @ApiOkResponse({ type: NetworkResponseDto })
  @Patch(':id/activate')
  public activate(@Param('id') id: string) {
    return this.networkService.activate(id);
  }

  @ApiOperation({ summary: 'Deactivate a network' })
  @ApiOkResponse({ type: NetworkResponseDto })
  @Patch(':id/deactivate')
  public deactivate(@Param('id') id: string) {
    return this.networkService.deactivate(id);
  }

  @ApiOperation({ summary: 'Soft-delete a network' })
  @ApiNoContentResponse({ description: 'Network soft-deleted' })
  @ApiNotFoundResponse({ description: 'Network not found' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  public remove(
    @Param('id', ParsePositiveIntPipe) _id: string,
  ) {
    return this.networkService.remove(_id);
  }
}
