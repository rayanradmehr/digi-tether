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
import { TokenService } from '../services/token.service';
import { CreateTokenDto } from '../dto/create-token.dto';
import { UpdateTokenDto } from '../dto/update-token.dto';
import { TokenQueryDto } from '../dto/token-query.dto';
import { TokenResponseDto } from '../dto/token-response.dto';
import { ApiSuccessResponseDto } from '@common/dto/api-success-response.dto';
import type { PaginatedResult } from '@common/pagination/paginated-result.type';

/**
 * HTTP entry point for the Token Module.
 *
 * ## Responsibilities (exhaustive)
 * - Bind HTTP verbs and paths to `TokenService` methods.
 * - Declare param/query/body types so the global `ValidationPipe` can
 *   parse, coerce, whitelist, and validate incoming data.
 * - Declare Swagger metadata for every endpoint.
 * - Return the value produced by the service — the global `ResponseInterceptor`
 *   wraps it in `{ success, data, message }`.
 *
 * ## Hard rules
 * - Zero business logic.
 * - Zero database access.
 * - Zero cache access.
 * - Never imports TypeORM, ICache, ILogger, or any repository.
 * - Never instantiates any class.
 * - Never calls more than ONE service method per handler.
 *
 * ## Routing note
 * `GET /tokens/network/:networkId` is declared BEFORE `GET /tokens/:id`
 * to prevent NestJS from resolving the literal segment 'network' as a UUID.
 *
 * ## Route prefix
 * `v1/tokens` — the `v1` prefix is set globally in `main.ts`.
 */
@ApiTags('Tokens')
@Controller('tokens')
export class TokenController {
  public constructor(private readonly tokenService: TokenService) {}

  // ---------------------------------------------------------------------------
  // POST /tokens
  // ---------------------------------------------------------------------------

  /**
   * Registers a new blockchain asset.
   *
   * Possible responses:
   * - 201 Created     — token registered; returns `TokenResponseDto`.
   * - 400 Bad Request — DTO validation failed.
   * - 409 Conflict    — uniqueness violation or inactive network.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new blockchain asset',
    description:
      'Creates a new token record. `networkId`, `type`, `standard`, ' +
      '`contractAddress`, and `decimals` are immutable after creation.',
  })
  @ApiCreatedResponse({
    description: 'Token registered successfully.',
    type: ApiSuccessResponseDto,
  })
  @ApiConflictResponse({
    description:
      'Uniqueness violation: duplicate symbol, contract address, or native token; ' +
      'or incompatible standard × driver; or inactive network.',
  })
  public async create(@Body() dto: CreateTokenDto): Promise<TokenResponseDto> {
    return this.tokenService.create(dto);
  }

  // ---------------------------------------------------------------------------
  // GET /tokens
  // ---------------------------------------------------------------------------

  /**
   * Returns a paginated, filterable list of live tokens.
   *
   * Possible responses:
   * - 200 OK          — paginated result; empty `data[]` when no records match.
   * - 400 Bad Request — invalid query parameter.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List tokens (paginated + filtered)',
    description:
      'Returns a paginated list of tokens. All query params are optional. ' +
      'Filters combine with AND semantics.',
  })
  @ApiOkResponse({
    description: 'Paginated token list.',
    type: ApiSuccessResponseDto,
  })
  public async findAll(
    @Query() query: TokenQueryDto,
  ): Promise<PaginatedResult<TokenResponseDto>> {
    return this.tokenService.findAll(query);
  }

  // ---------------------------------------------------------------------------
  // GET /tokens/network/:networkId
  // MUST be declared before GET /tokens/:id
  // ---------------------------------------------------------------------------

  /**
   * Returns a paginated list of tokens for a given network.
   *
   * Possible responses:
   * - 200 OK          — paginated result (may be empty).
   * - 400 Bad Request — malformed UUID or invalid query param.
   */
  @Get('network/:networkId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List tokens for a specific network (paginated + filtered)',
    description: 'Returns all live tokens belonging to the given network UUID.',
  })
  @ApiParam({
    name: 'networkId',
    description: 'UUID v4 of the parent network.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Paginated token list for the network.',
    type: ApiSuccessResponseDto,
  })
  public async findByNetworkId(
    @Param('networkId', ParseUUIDPipe) networkId: string,
    @Query() query: TokenQueryDto,
  ): Promise<PaginatedResult<TokenResponseDto>> {
    return this.tokenService.findByNetworkId(networkId, query);
  }

  // ---------------------------------------------------------------------------
  // GET /tokens/:id
  // ---------------------------------------------------------------------------

  /**
   * Fetches a single token by UUID.
   *
   * Possible responses:
   * - 200 OK          — token found; returns `TokenResponseDto`.
   * - 400 Bad Request — path parameter is not a valid UUID v4.
   * - 404 Not Found   — no live token with that UUID.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Find a token by UUID',
    description: 'Returns the token identified by its UUID primary key.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID v4 of the token.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({ description: 'Token record.', type: TokenResponseDto })
  @ApiNotFoundResponse({ description: 'Token not found.' })
  public async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TokenResponseDto> {
    return this.tokenService.findById(id);
  }

  // ---------------------------------------------------------------------------
  // PATCH /tokens/:id
  // ---------------------------------------------------------------------------

  /**
   * Partially updates mutable fields of an existing token.
   *
   * Possible responses:
   * - 200 OK          — update applied; returns updated `TokenResponseDto`.
   * - 400 Bad Request — invalid DTO field or malformed UUID.
   * - 404 Not Found   — token does not exist.
   * - 409 Conflict    — duplicate symbol or forbidden status transition.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update mutable token fields',
    description:
      'Partially updates a token. Immutable fields cannot be changed. ' +
      'Only provided fields are overwritten.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID v4 of the token to update.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({ description: 'Updated token record.', type: TokenResponseDto })
  @ApiNotFoundResponse({ description: 'Token not found.' })
  @ApiConflictResponse({ description: 'Duplicate symbol or forbidden status transition.' })
  public async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTokenDto,
  ): Promise<TokenResponseDto> {
    return this.tokenService.update(id, dto);
  }

  // ---------------------------------------------------------------------------
  // PATCH /tokens/:id/enable
  // ---------------------------------------------------------------------------

  /**
   * Sets the token status to ACTIVE.
   *
   * Idempotent. Forbidden when the token is DEPRECATED.
   *
   * Possible responses:
   * - 200 OK          — token is now active.
   * - 400 Bad Request — malformed UUID.
   * - 404 Not Found   — token does not exist.
   * - 409 Conflict    — token is DEPRECATED (terminal state).
   */
  @Patch(':id/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enable a token (set status to ACTIVE)',
    description: 'Sets status to ACTIVE. Idempotent. Forbidden for DEPRECATED tokens.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID v4 of the token to enable.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({ description: 'Token enabled.', type: TokenResponseDto })
  @ApiNotFoundResponse({ description: 'Token not found.' })
  @ApiConflictResponse({ description: 'Token is DEPRECATED and cannot be re-enabled.' })
  public async enable(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TokenResponseDto> {
    return this.tokenService.enable(id);
  }

  // ---------------------------------------------------------------------------
  // PATCH /tokens/:id/disable
  // ---------------------------------------------------------------------------

  /**
   * Sets the token status to INACTIVE.
   *
   * Idempotent. Forbidden when the token is DEPRECATED.
   *
   * Possible responses:
   * - 200 OK          — token is now inactive.
   * - 400 Bad Request — malformed UUID.
   * - 404 Not Found   — token does not exist.
   * - 409 Conflict    — token is DEPRECATED (terminal state).
   */
  @Patch(':id/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Disable a token (set status to INACTIVE)',
    description: 'Sets status to INACTIVE. Idempotent. Forbidden for DEPRECATED tokens.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID v4 of the token to disable.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({ description: 'Token disabled.', type: TokenResponseDto })
  @ApiNotFoundResponse({ description: 'Token not found.' })
  @ApiConflictResponse({ description: 'Token is DEPRECATED and cannot be suspended.' })
  public async disable(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TokenResponseDto> {
    return this.tokenService.disable(id);
  }

  // ---------------------------------------------------------------------------
  // PATCH /tokens/:id/deprecate
  // ---------------------------------------------------------------------------

  /**
   * Sets the token status to DEPRECATED (terminal — irreversible).
   *
   * Possible responses:
   * - 200 OK          — token is now deprecated.
   * - 400 Bad Request — malformed UUID.
   * - 404 Not Found   — token does not exist.
   * - 409 Conflict    — token is already DEPRECATED.
   */
  @Patch(':id/deprecate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deprecate a token (terminal — irreversible)',
    description:
      'Sets status to DEPRECATED. This is a terminal state — the token can ' +
      'never be re-enabled or suspended after this call.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID v4 of the token to deprecate.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({ description: 'Token deprecated.', type: TokenResponseDto })
  @ApiNotFoundResponse({ description: 'Token not found.' })
  @ApiConflictResponse({ description: 'Token is already DEPRECATED.' })
  public async deprecate(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TokenResponseDto> {
    return this.tokenService.deprecate(id);
  }

  // ---------------------------------------------------------------------------
  // DELETE /tokens/:id
  // ---------------------------------------------------------------------------

  /**
   * Soft-deletes a token.
   *
   * The row is retained in the database permanently for audit and referential
   * integrity. Hard deletion is forbidden (Invariant 12).
   * Returns 204 No Content on success.
   *
   * Possible responses:
   * - 204 No Content — token soft-deleted.
   * - 400 Bad Request — malformed UUID.
   * - 404 Not Found   — token does not exist or is already deleted.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft-delete a token',
    description:
      'Marks the token as deleted (`deleted_at` timestamp set). ' +
      'The row is permanently retained for audit and referential integrity. ' +
      'Hard deletion is forbidden by architecture invariant.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID v4 of the token to delete.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiNoContentResponse({ description: 'Token soft-deleted. No response body.' })
  @ApiNotFoundResponse({ description: 'Token not found.' })
  public async remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.tokenService.remove(id);
  }
}
