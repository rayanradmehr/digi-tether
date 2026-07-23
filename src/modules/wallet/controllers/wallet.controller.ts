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

@ApiTags('Wallets')
@Controller('wallets')
export class WalletController {
  public constructor(private readonly walletService: WalletService) {}

  @Post('assign')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Assign a wallet to a customer' })
  @ApiCreatedResponse({ description: 'Wallet assigned successfully.', type: WalletResponseDto })
  @ApiBadRequestResponse({ description: 'DTO validation failed.' })
  @ApiConflictResponse({ description: 'Pool exhausted.' })
  public async assign(@Body() dto: AssignWalletDto): Promise<WalletResponseDto> {
    const result = await this.walletService.assignWallet({
      customerId: dto.customerId,
      driverFamily: dto.driverFamily,
    });
    const entity = await this.walletService.findById(result.walletId);
    return WalletResponseDto.fromEntity(entity);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List wallets (paginated + filtered)' })
  @ApiOkResponse({ description: 'Paginated wallet list.', type: PaginatedWalletResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid query parameter value.' })
  public async findAll(@Query() query: WalletQueryDto): Promise<PaginatedWalletResponseDto> {
    const result = await this.walletService.findAll(query);
    const data = result.data.map(WalletResponseDto.fromEntity);
    return PaginatedWalletResponseDto.of(data, result.total, result.page, result.limit);
  }

  @Get('customer/:customerId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Find all wallets for a customer' })
  @ApiParam({ name: 'customerId', description: 'Opaque customer identifier. PII — never log.' })
  @ApiOkResponse({ description: 'All wallets assigned to the customer.', type: WalletResponseDto, isArray: true })
  public async findAllByCustomer(
    @Param('customerId') customerId: string,
  ): Promise<WalletResponseDto[]> {
    const wallets = await this.walletService.findAllByCustomer(customerId);
    return wallets.map(WalletResponseDto.fromEntity);
  }

  @Get('address/:address')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Find a wallet by blockchain address' })
  @ApiParam({ name: 'address', description: 'Blockchain address (case-sensitive).' })
  @ApiOkResponse({ description: 'Wallet record.', type: WalletResponseDto })
  @ApiNotFoundResponse({ description: 'No wallet found with the given address.' })
  public async findByAddress(@Param('address') address: string): Promise<WalletResponseDto> {
    const wallet = await this.walletService.findByAddress(address);
    return WalletResponseDto.fromEntity(wallet);
  }

  @Get('pool/:family')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get AVAILABLE wallet pool depth for a family' })
  @ApiParam({ name: 'family', enum: WalletFamily })
  @ApiOkResponse({ description: 'AVAILABLE wallet count for the family.' })
  @ApiBadRequestResponse({ description: 'Invalid family value.' })
  public async getPoolStatus(
    @Param('family') family: WalletFamily,
  ): Promise<{ family: WalletFamily; availableCount: number }> {
    const availableCount = await this.walletService.getPoolStatus(family);
    return { family, availableCount };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Find a wallet by UUID' })
  @ApiParam({ name: 'id', description: 'UUID v4 of the wallet.' })
  @ApiOkResponse({ description: 'Wallet record.', type: WalletResponseDto })
  @ApiBadRequestResponse({ description: 'Path parameter is not a valid UUID v4.' })
  @ApiNotFoundResponse({ description: 'Wallet not found.' })
  public async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WalletResponseDto> {
    const wallet = await this.walletService.findById(id);
    return WalletResponseDto.fromEntity(wallet);
  }

  @Patch(':id/lock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lock a wallet' })
  @ApiParam({ name: 'id', description: 'UUID v4 of the wallet to lock.' })
  @ApiOkResponse({ description: 'Wallet locked.', type: WalletResponseDto })
  @ApiBadRequestResponse({ description: 'Malformed UUID or missing lockReason.' })
  @ApiNotFoundResponse({ description: 'Wallet not found.' })
  @ApiUnprocessableEntityResponse({ description: 'Wallet is already LOCKED or terminal.' })
  public async lock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWalletDto,
  ): Promise<WalletResponseDto> {
    const wallet = await this.walletService.lockWallet(id, dto.lockReason ?? '');
    return WalletResponseDto.fromEntity(wallet);
  }

  @Patch(':id/unlock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlock a locked wallet' })
  @ApiParam({ name: 'id', description: 'UUID v4 of the wallet to unlock.' })
  @ApiOkResponse({ description: 'Wallet unlocked.', type: WalletResponseDto })
  @ApiBadRequestResponse({ description: 'Malformed UUID.' })
  @ApiNotFoundResponse({ description: 'Wallet not found.' })
  @ApiUnprocessableEntityResponse({ description: 'Wallet is not currently LOCKED.' })
  public async unlock(@Param('id', ParseUUIDPipe) id: string): Promise<WalletResponseDto> {
    const wallet = await this.walletService.unlockWallet(id);
    return WalletResponseDto.fromEntity(wallet);
  }

  @Patch(':id/compromise')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a wallet as compromised (terminal)' })
  @ApiParam({ name: 'id', description: 'UUID v4 of the wallet to compromise.' })
  @ApiOkResponse({ description: 'Wallet permanently compromised.', type: WalletResponseDto })
  @ApiBadRequestResponse({ description: 'Malformed UUID or missing lockReason.' })
  @ApiNotFoundResponse({ description: 'Wallet not found.' })
  @ApiUnprocessableEntityResponse({ description: 'Wallet is already terminal.' })
  public async compromise(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWalletDto,
  ): Promise<WalletResponseDto> {
    const wallet = await this.walletService.compromiseWallet(id, dto.lockReason ?? '');
    return WalletResponseDto.fromEntity(wallet);
  }

  @Patch(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a wallet (terminal)' })
  @ApiParam({ name: 'id', description: 'UUID v4 of the wallet to archive.' })
  @ApiOkResponse({ description: 'Wallet archived.', type: WalletResponseDto })
  @ApiBadRequestResponse({ description: 'Malformed UUID or missing lockReason.' })
  @ApiNotFoundResponse({ description: 'Wallet not found.' })
  @ApiUnprocessableEntityResponse({ description: 'Wallet is in ASSIGNED, COMPROMISED, or ARCHIVED status.' })
  public async archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWalletDto,
  ): Promise<WalletResponseDto> {
    const wallet = await this.walletService.archiveWallet(id, dto.lockReason ?? '');
    return WalletResponseDto.fromEntity(wallet);
  }
}
