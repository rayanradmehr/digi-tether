import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { NetworkService } from '../services/network.service';
import { CreateNetworkDto } from '../dto/create-network.dto';
import { UpdateNetworkDto } from '../dto/update-network.dto';
import { NetworkQueryDto } from '../dto/network-query.dto';
import { NetworkResponseDto } from '../dto/network-response.dto';
import { ApiSuccessResponseDto } from '@common/dto/api-success-response.dto';
import type { PaginatedResult } from '@common/pagination/paginated-result.type';

/**
 * HTTP entry point for the Network Module.
 *
 * ## Responsibilities (exhaustive)
 * - Bind HTTP verbs and paths to `NetworkService` methods.
 * - Declare param/query/body types so the global `ValidationPipe` can
 *   parse, coerce, whitelist and validate incoming data.
 * - Declare Swagger metadata for every endpoint.
 * - Return the value produced by the service, unwrapped — the global
 *   `ResponseInterceptor` wraps it in `{ success, data, message }`.
 *
 * ## Hard rules
 * - Zero business logic.
 * - Zero database access.
 * - Zero cache access.
 * - Zero blockchain / RPC / driver logic.
 * - Never imports TypeORM, ICache, ILogger, or any repository.
 * - Never instantiates any class.
 * - Never calls more than ONE service method per handler.
 *
 * ## Route prefix
 * `v1/networks` — `v1` comes from the global prefix set in `main.ts`.
 */
@ApiTags('Networks')
@Controller('networks')
export class NetworkController {
  public constructor(private readonly networkService: NetworkService) {}

  // ---------------------------------------------------------------------------
  // POST /networks
  // ---------------------------------------------------------------------------

  /**
   * Registers a new blockchain network.
   *
   * The global `ValidationPipe` (whitelist + forbidNonWhitelisted + transform)
   * validates the body before this handler is invoked.
   *
   * Possible responses:
   * - 201 Created    — network registered; returns `NetworkResponseDto`.
   * - 400 Bad Request — DTO validation failed (missing/invalid fields).
   * - 409 Conflict   — `slug` or `chainId` already exists.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new blockchain network',
    description:
      'Creates a new network metadata record. `slug` and `chainId` are immutable after creation.',
  })
  @ApiCreatedResponse({
    description: 'Network registered successfully.',
    type: ApiSuccessResponseDto,
  })
  @ApiConflictResponse({ description: 'A network with the same slug or chainId already exists.' })
  public async create(@Body() dto: CreateNetworkDto): Promise<NetworkResponseDto> {
    return this.networkService.create(dto);
  }

  // ---------------------------------------------------------------------------
  // GET /networks
  // ---------------------------------------------------------------------------

  /**
   * Returns a paginated, filterable list of networks.
   *
   * Pagination (`page`, `limit`) and filters (`driverKey`, `isActive`,
   * `isTestnet`) are delivered as query-string parameters and validated by
   * the global `ValidationPipe` via `NetworkQueryDto`.
   *
   * Possible responses:
   * - 200 OK — paginated result; empty `data[]` when no records match.
   * - 400 Bad Request — invalid query parameter (e.g. negative page).
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List networks (paginated + filtered)',
    description:
      'Returns a paginated list of networks. All query params are optional. ' +
      'Filters are combined with AND semantics.',
  })
  @ApiOkResponse({
    description: 'Paginated network list.',
    type: ApiSuccessResponseDto,
  })
  public async findAll(
    @Query() query: NetworkQueryDto,
  ): Promise<PaginatedResult<NetworkResponseDto>> {
    return this.networkService.findAll(query);
  }

  // ---------------------------------------------------------------------------
  // GET /networks/slug/:slug
  // ---------------------------------------------------------------------------

  /**
   * Fetches a single network by its URL-safe slug.
   *
   * This route MUST be declared BEFORE `GET /networks/:id` so that
   * NestJS does not try to parse 'slug' as a UUID when the static
   * prefix segment 'slug' is present.
   *
   * Possible responses:
   * - 200 OK        — network found; returns `NetworkResponseDto`.
   * - 404 Not Found — no non-deleted network with that slug.
   */
  @Get('slug/:slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Find a network by slug',
    description: 'Returns the network whose slug exactly matches the path parameter.',
  })
  @ApiParam({
    name: 'slug',
    description: 'URL-safe slug (e.g. ethereum-mainnet)',
    example: 'ethereum-mainnet',
  })
  @ApiOkResponse({
    description: 'Network record.',
    type: NetworkResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Network not found.' })
  public async findBySlug(@Param('slug') slug: string): Promise<NetworkResponseDto> {
    return this.networkService.findBySlug(slug);
  }

  // ---------------------------------------------------------------------------
  // GET /networks/:id
  // ---------------------------------------------------------------------------

  /**
   * Fetches a single network by its UUID primary key.
   *
   * `ParseUUIDPipe` rejects malformed UUIDs with 400 before the service
   * is invoked, so the service can assume `id` is a valid UUID format.
   *
   * Possible responses:
   * - 200 OK        — network found; returns `NetworkResponseDto`.
   * - 400 Bad Request — path parameter is not a valid UUID v4.
   * - 404 Not Found — no non-deleted network with that UUID.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Find a network by UUID',
    description: 'Returns the network identified by its UUID primary key.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID v4 of the network',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Network record.',
    type: NetworkResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Network not found.' })
  public async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NetworkResponseDto> {
    return this.networkService.findById(id);
  }

  // ---------------------------------------------------------------------------
  // PATCH /networks/:id
  // ---------------------------------------------------------------------------

  /**
   * Partially updates mutable fields of an existing network.
   *
   * Only fields included in the request body are updated.
   * `slug` and `chainId` are absent from `UpdateNetworkDto` and therefore
   * structurally impossible to change through this endpoint.
   *
   * Possible responses:
   * - 200 OK        — update applied; returns updated `NetworkResponseDto`.
   * - 400 Bad Request — invalid DTO field or malformed UUID.
   * - 404 Not Found — network does not exist.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update mutable network fields',
    description:
      'Partially updates a network. `slug` and `chainId` cannot be changed. ' +
      'Only provided fields are overwritten.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID v4 of the network to update',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Updated network record.',
    type: NetworkResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Network not found.' })
  public async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNetworkDto,
  ): Promise<NetworkResponseDto> {
    return this.networkService.update(id, dto);
  }

  // ---------------------------------------------------------------------------
  // PATCH /networks/:id/activate
  // ---------------------------------------------------------------------------

  /**
   * Activates a network by setting `isActive = true`.
   *
   * Idempotent: calling this on an already-active network returns 200
   * without error. No request body is required or accepted.
   *
   * Possible responses:
   * - 200 OK        — network is now active; returns updated `NetworkResponseDto`.
   * - 400 Bad Request — malformed UUID.
   * - 404 Not Found — network does not exist.
   */
  @Patch(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activate a network',
    description:
      'Sets `isActive = true`. Idempotent. No request body needed. ' +
      'Does NOT cascade to wallets, tokens, or in-flight operations.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID v4 of the network to activate',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Network activated.',
    type: NetworkResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Network not found.' })
  public async activate(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NetworkResponseDto> {
    return this.networkService.activate(id);
  }

  // ---------------------------------------------------------------------------
  // PATCH /networks/:id/deactivate
  // ---------------------------------------------------------------------------

  /**
   * Deactivates a network by setting `isActive = false`.
   *
   * Idempotent: calling this on an already-inactive network returns 200.
   * Does NOT cascade — downstream modules check `networkService.isActive()`
   * before performing on-chain operations.
   *
   * Possible responses:
   * - 200 OK        — network is now inactive; returns updated `NetworkResponseDto`.
   * - 400 Bad Request — malformed UUID.
   * - 404 Not Found — network does not exist.
   */
  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deactivate a network',
    description:
      'Sets `isActive = false`. Idempotent. No request body needed. ' +
      'Does NOT cascade — downstream modules must check `isActive` independently.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID v4 of the network to deactivate',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Network deactivated.',
    type: NetworkResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Network not found.' })
  public async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NetworkResponseDto> {
    return this.networkService.deactivate(id);
  }

  // ---------------------------------------------------------------------------
  // DELETE /networks/:id
  // ---------------------------------------------------------------------------

  /**
   * Soft-deletes a network.
   *
   * The row is retained in the database (no hard deletion ever).
   * After this call, all `find*` queries exclude the record automatically.
   * Returns 204 No Content — no response body on successful deletion.
   *
   * Possible responses:
   * - 204 No Content — network soft-deleted.
   * - 400 Bad Request — malformed UUID.
   * - 404 Not Found — network does not exist or is already deleted.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft-delete a network',
    description:
      'Marks the network as deleted (`deleted_at` timestamp set). ' +
      'The row is permanently retained for audit and referential integrity. ' +
      'Hard deletion is forbidden by architecture rule.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID v4 of the network to delete',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiNoContentResponse({ description: 'Network soft-deleted. No response body.' })
  @ApiNotFoundResponse({ description: 'Network not found.' })
  public async remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.networkService.remove(id);
  }
}
