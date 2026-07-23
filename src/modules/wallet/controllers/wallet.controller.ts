import {
  Body,
  Controller,
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
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { WalletService } from '../services/wallet.service';
import { AssignWalletDto } from '../dto/assign-wallet.dto';
import { UpdateWalletDto } from '../dto/update-wallet.dto';
import { WalletQueryDto } from '../dto/wallet-query.dto';
import {
  PaginatedWalletResponseDto,
  WalletResponseDto,
} from '../dto/wallet-response.dto';
import { WalletFamily } from '../enums/wallet-family.enum';

/**
 * HTTP entry point for the Wallet Module.
 *
 * ## Responsibilities (exhaustive)
 * - Bind HTTP verbs and paths to `WalletService` methods.
 * - Declare param/query/body types so the global `ValidationPipe`
 *   (whitelist + forbidNonWhitelisted + transform) can validate input.
 * - Declare Swagger metadata for every endpoint.
 * - Map `WalletEntity` returns to `WalletResponseDto` via the static
 *   `WalletResponseDto.fromEntity()` factory — the ONLY post-processing
 *   permitted here.
 * - Return the mapped value; the global `ResponseInterceptor` wraps it
 *   in `{ success, data, message }`.
 *
 * ## Hard rules (ARCHITECTURE.md §11.2)
 * - Zero business logic.
 * - Zero database access.
 * - Zero cache access.
 * - Zero blockchain / RPC / driver logic.
 * - Never imports TypeORM, Cache, EventEmitter, or any repository.
 * - Never instantiates any class other than calling static factory methods.
 * - Never calls more than ONE service method per handler.
 * - `customerId` is PII — never logged, never included in error messages.
 *
 * ## Route prefix
 * `v1/wallets` — `v1` comes from the global prefix set in `main.ts`.
 *
 * ## Route table
 * | Method | Path                             | Handler            | Status |
 * |--------|----------------------------------|--------------------|--------|
 * | POST   | /wallets/assign                  | assign             | 201    |
 * | GET    | /wallets                         | findAll            | 200    |
 * | GET    | /wallets/customer/:customerId    | findAllByCustomer  | 200    |
 * | GET    | /wallets/address/:address        | findByAddress      | 200    |
 * | GET    | /wallets/pool/:family            | getPoolStatus      | 200    |
 * | GET    | /wallets/:id                     | findById           | 200    |
 * | PATCH  | /wallets/:id/lock                | lock               | 200    |
 * | PATCH  | /wallets/:id/unlock              | unlock             | 200    |
 * | PATCH  | /wallets/:id/compromise          | compromise         | 200    |
 * | PATCH  | /wallets/:id/archive             | archive            | 200    |
 *
 * IMPORTANT: static-prefix routes (`assign`, `customer/:x`, `address/:x`,
 * `pool/:x`) MUST be declared BEFORE the dynamic `:id` route to prevent
 * NestJS from matching the literal string 'assign' as a UUID.
 */
@ApiTags('Wallets')
@Controller('wallets')
export class WalletController {
  public constructor(private readonly walletService: WalletService) {}

  // ---------------------------------------------------------------------------
  // POST /wallets/assign
  // ---------------------------------------------------------------------------

  /**
   * Assigns an AVAILABLE wallet from the pool to a customer.
   *
   * Executes the mandatory 2-phase reserve→assign protocol internally.
   * Idempotent: if the customer already has a wallet for the requested
   * family, returns the existing wallet without side effects.
   *
   * - 201 Created    — wallet assigned; returns `WalletResponseDto`.
   * - 400 Bad Request — DTO validation failed.
   * - 409 Conflict   — pool exhausted: no AVAILABLE wallet for the requested family.
   */
  @Post('assign')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Assign a wallet to a customer',
    description:
      'Atomically reserves and assigns an AVAILABLE wallet from the pool to the ' +
      'specified customer. Idempotent: if the customer already holds a wallet for ' +
      'the requested family, the existing wallet is returned unchanged. ' +
      '`customerId` is PII — never log this field.',
  })
  @ApiCreatedResponse({
    description: 'Wallet assigned successfully.',
    type: WalletResponseDto,
  })
  @ApiBadRequestResponse({ description: 'DTO validation failed (missing or invalid fields).' })
  @ApiConflictResponse({
    description: 'Pool exhausted — no AVAILABLE wallet exists for the requested family.',
  })
  public async assign(@Body() dto: AssignWalletDto): Promise<WalletResponseDto> {
    const result = await this.walletService.assignWallet({
      customerId: dto.customerId,
      driverFamily: dto.driverFamily,
    });
    const entity = await this.walletService.findById(result.walletId);
    return WalletResponseDto.fromEntity(entity);
  }

  // ---------------------------------------------------------------------------
  // GET /wallets  (must come before :id)
  // ---------------------------------------------------------------------------

  /**
   * Returns a paginated, filterable list of wallets.
   *
   * All filters are optional and combined with AND semantics.
   * Use `?status=AVAILABLE&driverFamily=EVM` to monitor pool depth.
   *
   * - 200 OK          — paginated result; `data[]` is empty when no records match.
   * - 400 Bad Request — invalid query parameter.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List wallets (paginated + filtered)',
    description:
      'Returns a paginated list of wallets. All query params are optional. ' +
      'Filters are combined with AND semantics. ' +
      'Use `?status=AVAILABLE` to inspect pool depth. ' +
      '`customerId` query param is PII — omit from request logs.',
  })
  @ApiOkResponse({
    description: 'Paginated wallet list.',
    type: PaginatedWalletResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid query parameter value.' })
  public async findAll(
    @Query() query: WalletQueryDto,
  ): Promise<PaginatedWalletResponseDto> {
    const result = await this.walletService.findAll(query);
    const data = result.data.map(WalletResponseDto.fromEntity);
    return PaginatedWalletResponseDto.of(
      data,
      result.total,
      result.page,
      result.limit,
    );
  }

  // ---------------------------------------------------------------------------
  // GET /wallets/customer/:customerId  (static prefix — before :id)
  // ---------------------------------------------------------------------------

  /**
   * Returns all wallets assigned to a customer across all families.
   *
   * - 200 OK — array of `WalletResponseDto`; empty array if none assigned.
   */
  @Get('customer/:customerId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Find all wallets for a customer',
    description:
      'Returns every wallet assigned to the specified customer across all ' +
      'cryptographic families. `customerId` is PII — handle with care.',
  })
  @ApiParam({
    name: 'customerId',
    description: 'Opaque customer identifier. PII — never log.',
    example: 'cust_01HX5K3MZPQ8R9T2VWYX4ZBCD',
  })
  @ApiOkResponse({
    description: 'All wallets assigned to the customer.',
    type: WalletResponseDto,
    isArray: true,
  })
  public async findAllByCustomer(
    @Param('customerId') customerId: string,
  ): Promise<WalletResponseDto[]> {
    const wallets = await this.walletService.findAllByCustomer(customerId);
    return wallets.map(WalletResponseDto.fromEntity);
  }

  // ---------------------------------------------------------------------------
  // GET /wallets/address/:address  (static prefix — before :id)
  // ---------------------------------------------------------------------------

  /**
   * Returns a wallet by its blockchain address.
   *
   * Useful for deposit monitoring: given an on-chain transaction target
   * address, returns the platform wallet record associated with it.
   *
   * - 200 OK        — wallet found.
   * - 404 Not Found — no wallet with that address.
   */
  @Get('address/:address')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Find a wallet by blockchain address',
    description:
      'Returns the wallet record whose `address` field exactly matches the ' +
      'path parameter. Case-sensitive match.',
  })
  @ApiParam({
    name: 'address',
    description: 'Blockchain address (case-sensitive).',
    example: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  })
  @ApiOkResponse({
    description: 'Wallet record.',
    type: WalletResponseDto,
  })
  @ApiNotFoundResponse({ description: 'No wallet found with the given address.' })
  public async findByAddress(
    @Param('address') address: string,
  ): Promise<WalletResponseDto> {
    const wallet = await this.walletService.findByAddress(address);
    return WalletResponseDto.fromEntity(wallet);
  }

  // ---------------------------------------------------------------------------
  // GET /wallets/pool/:family  (static prefix — before :id)
  // ---------------------------------------------------------------------------

  /**
   * Returns the count of AVAILABLE wallets for a given family.
   *
   * Used by monitoring dashboards and alerting systems to inspect pool depth
   * without needing a full wallet list.
   *
   * - 200 OK          — pool count returned.
   * - 400 Bad Request — `family` is not a recognised WalletFamily enum value.
   */
  @Get('pool/:family')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get AVAILABLE wallet pool depth for a family',
    description:
      'Returns the number of AVAILABLE wallets in the pool for the specified ' +
      'cryptographic family. Used for monitoring and alerting.',
  })
  @ApiParam({
    name: 'family',
    description: 'Cryptographic family.',
    enum: WalletFamily,
    example: WalletFamily.EVM,
  })
  @ApiOkResponse({
    description: 'AVAILABLE wallet count for the family.',
    schema: {
      type: 'object',
      properties: {
        family: { type: 'string', enum: Object.values(WalletFamily) },
        availableCount: { type: 'number', example: 382 },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid family value.' })
  public async getPoolStatus(
    @Param('family') family: WalletFamily,
  ): Promise<{ family: WalletFamily; availableCount: number }> {
    const availableCount = await this.walletService.getPoolStatus(family);
    return { family, availableCount };
  }

  // ---------------------------------------------------------------------------
  // GET /wallets/:id
  // ---------------------------------------------------------------------------

  /**
   * Returns a single wallet by its UUID primary key.
   *
   * `ParseUUIDPipe` rejects malformed UUIDs with 400 before the service
   * is invoked.
   *
   * - 200 OK        — wallet found.
   * - 400 Bad Request — path parameter is not a valid UUID v4.
   * - 404 Not Found — no wallet with that UUID (or soft-deleted).
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Find a wallet by UUID',
    description: 'Returns the wallet identified by its UUID primary key.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID v4 of the wallet.',
    example: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
  })
  @ApiOkResponse({
    description: 'Wallet record.',
    type: WalletResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Path parameter is not a valid UUID v4.' })
  @ApiNotFoundResponse({ description: 'Wallet not found.' })
  public async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WalletResponseDto> {
    const wallet = await this.walletService.findById(id);
    return WalletResponseDto.fromEntity(wallet);
  }

  // ---------------------------------------------------------------------------
  // PATCH /wallets/:id/lock
  // ---------------------------------------------------------------------------

  /**
   * Locks a wallet.
   *
   * Transitions: AVAILABLE → LOCKED, ASSIGNED → LOCKED.
   * Requires `lockReason` in the request body (operator audit trail).
   * Forbidden from COMPROMISED or ARCHIVED (terminal states).
   *
   * - 200 OK                  — wallet is now LOCKED.
   * - 400 Bad Request          — malformed UUID or DTO validation failed.
   * - 404 Not Found            — wallet not found.
   * - 422 Unprocessable Entity — wallet is already LOCKED or in a terminal state.
   */
  @Patch(':id/lock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lock a wallet',
    description:
      'Transitions the wallet to LOCKED status. Permitted from AVAILABLE or ASSIGNED only. ' +
      'Requires a human-readable `lockReason`. ' +
      'Forbidden from terminal states (COMPROMISED, ARCHIVED). ' +
      'Does NOT affect on-chain activity — downstream consumers must check wallet status.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID v4 of the wallet to lock.',
    example: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
  })
  @ApiOkResponse({
    description: 'Wallet locked. Returns updated wallet record.',
    type: WalletResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Malformed UUID or missing lockReason.' })
  @ApiNotFoundResponse({ description: 'Wallet not found.' })
  @ApiUnprocessableEntityResponse({
    description: 'Wallet is already LOCKED or in a terminal state (COMPROMISED / ARCHIVED).',
  })
  public async lock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWalletDto,
  ): Promise<WalletResponseDto> {
    const wallet = await this.walletService.lockWallet(
      id,
      dto.lockReason ?? '',
    );
    return WalletResponseDto.fromEntity(wallet);
  }

  // ---------------------------------------------------------------------------
  // PATCH /wallets/:id/unlock
  // ---------------------------------------------------------------------------

  /**
   * Unlocks a LOCKED wallet, restoring its previous status.
   *
   * No request body required.
   * Permitted from LOCKED only.
   *
   * - 200 OK                  — wallet restored to previous status.
   * - 400 Bad Request          — malformed UUID.
   * - 404 Not Found            — wallet not found.
   * - 422 Unprocessable Entity — wallet is not currently LOCKED.
   */
  @Patch(':id/unlock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unlock a locked wallet',
    description:
      'Restores a LOCKED wallet to its previous status (AVAILABLE or ASSIGNED). ' +
      'No request body required. Permitted from LOCKED status only.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID v4 of the wallet to unlock.',
    example: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
  })
  @ApiOkResponse({
    description: 'Wallet unlocked. Returns updated wallet record with restored status.',
    type: WalletResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Malformed UUID.' })
  @ApiNotFoundResponse({ description: 'Wallet not found.' })
  @ApiUnprocessableEntityResponse({
    description: 'Wallet is not currently LOCKED.',
  })
  public async unlock(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WalletResponseDto> {
    const wallet = await this.walletService.unlockWallet(id);
    return WalletResponseDto.fromEntity(wallet);
  }

  // ---------------------------------------------------------------------------
  // PATCH /wallets/:id/compromise
  // ---------------------------------------------------------------------------

  /**
   * Permanently marks a wallet as COMPROMISED.
   *
   * TERMINAL — no further transitions are permitted after this call.
   * Requires `lockReason` in the request body (incident audit trail).
   * Forbidden from COMPROMISED and ARCHIVED.
   *
   * - 200 OK                  — wallet is now COMPROMISED.
   * - 400 Bad Request          — malformed UUID or missing reason.
   * - 404 Not Found            — wallet not found.
   * - 422 Unprocessable Entity — wallet is already in a terminal state.
   */
  @Patch(':id/compromise')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a wallet as compromised (terminal)',
    description:
      'Permanently transitions the wallet to COMPROMISED status. ' +
      'TERMINAL — no further status change is permitted. ' +
      'Requires a mandatory `lockReason` documenting the incident. ' +
      'Must not contain PII or private key material.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID v4 of the wallet to compromise.',
    example: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
  })
  @ApiOkResponse({
    description: 'Wallet permanently compromised. Returns updated wallet record.',
    type: WalletResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Malformed UUID or missing lockReason.' })
  @ApiNotFoundResponse({ description: 'Wallet not found.' })
  @ApiUnprocessableEntityResponse({
    description: 'Wallet is already in a terminal state (COMPROMISED or ARCHIVED).',
  })
  public async compromise(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWalletDto,
  ): Promise<WalletResponseDto> {
    const wallet = await this.walletService.compromiseWallet(
      id,
      dto.lockReason ?? '',
    );
    return WalletResponseDto.fromEntity(wallet);
  }

  // ---------------------------------------------------------------------------
  // PATCH /wallets/:id/archive
  // ---------------------------------------------------------------------------

  /**
   * Retires a wallet to ARCHIVED status.
   *
   * TERMINAL — no further transitions are permitted after this call.
   * Permitted from AVAILABLE or LOCKED only.
   * ASSIGNED wallets must be compromised, not archived.
   * Requires `lockReason` in the request body (retirement audit trail).
   *
   * - 200 OK                  — wallet is now ARCHIVED.
   * - 400 Bad Request          — malformed UUID or missing reason.
   * - 404 Not Found            — wallet not found.
   * - 422 Unprocessable Entity — wallet is in ASSIGNED, COMPROMISED, or ARCHIVED status.
   */
  @Patch(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Archive a wallet (terminal)',
    description:
      'Permanently retires the wallet to ARCHIVED status. ' +
      'TERMINAL — no further status change is permitted. ' +
      'Permitted from AVAILABLE or LOCKED only. ' +
      'ASSIGNED wallets must be COMPROMISED first — archiving them directly is forbidden. ' +
      'Requires a mandatory `lockReason` for audit.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID v4 of the wallet to archive.',
    example: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
  })
  @ApiOkResponse({
    description: 'Wallet archived. Returns updated wallet record.',
    type: WalletResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Malformed UUID or missing lockReason.' })
  @ApiNotFoundResponse({ description: 'Wallet not found.' })
  @ApiUnprocessableEntityResponse({
    description:
      'Wallet is in ASSIGNED, COMPROMISED, or already ARCHIVED status.',
  })
  public async archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWalletDto,
  ): Promise<WalletResponseDto> {
    const wallet = await this.walletService.archiveWallet(
      id,
      dto.lockReason ?? '',
    );
    return WalletResponseDto.fromEntity(wallet);
  }
}
