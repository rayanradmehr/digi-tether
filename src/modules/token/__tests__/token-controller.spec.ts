import { Test, TestingModule } from '@nestjs/testing';
import { TokenController } from '../controllers/token.controller';
import { TokenService } from '../services/token.service';
import { TokenType } from '../enums/token-type.enum';
import { TokenStatus } from '../enums/token-status.enum';
import { TokenStandard } from '../enums/token-standard.enum';
import { NotFoundException } from '@core/exceptions/not-found.exception';
import { ConflictException } from '@core/exceptions/conflict.exception';
import type { TokenResponseDto } from '../dto/token-response.dto';
import type { CreateTokenDto } from '../dto/create-token.dto';
import type { UpdateTokenDto } from '../dto/update-token.dto';
import type { TokenQueryDto } from '../dto/token-query.dto';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NETWORK_ID = '11111111-1111-1111-1111-111111111111';
const TOKEN_ID   = '22222222-2222-2222-2222-222222222222';

function makeResponseDto(overrides: Partial<TokenResponseDto> = {}): TokenResponseDto {
  return {
    id: TOKEN_ID,
    networkId: NETWORK_ID,
    type: TokenType.CONTRACT,
    standard: TokenStandard.ERC20,
    name: 'Tether USD',
    symbol: 'USDT',
    decimals: 6,
    contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    status: TokenStatus.ACTIVE,
    confirmationsOverride: null,
    logoUrl: null,
    description: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

function mockTokenService(): jest.Mocked<TokenService> {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    findByNetworkId: jest.fn(),
    findActiveByNetworkId: jest.fn(),
    update: jest.fn(),
    enable: jest.fn(),
    disable: jest.fn(),
    deprecate: jest.fn(),
    remove: jest.fn(),
    isActive: jest.fn(),
    getDecimals: jest.fn(),
    getConfirmations: jest.fn(),
    getExplorerUrl: jest.fn(),
  } as unknown as jest.Mocked<TokenService>;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('TokenController', () => {
  let controller: TokenController;
  let service: jest.Mocked<TokenService>;

  beforeEach(async () => {
    service = mockTokenService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TokenController],
      providers: [{ provide: TokenService, useValue: service }],
    }).compile();

    controller = module.get(TokenController);
  });

  // -------------------------------------------------------------------------
  // Architecture compliance: controller must contain zero business logic
  // -------------------------------------------------------------------------

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates every call to TokenService — never to repos, TypeORM, or cache', () => {
    // Structural assertion: controller only holds TokenService
    const controllerSrc = (controller as unknown as { tokenService: unknown }).tokenService;
    expect(controllerSrc).toBe(service);
  });

  // -------------------------------------------------------------------------
  // POST /tokens — create
  // -------------------------------------------------------------------------

  describe('create', () => {
    const dto: CreateTokenDto = {
      networkId: NETWORK_ID,
      type: TokenType.CONTRACT,
      standard: TokenStandard.ERC20,
      name: 'Tether USD',
      symbol: 'USDT',
      decimals: 6,
      contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    };

    it('returns the DTO produced by service.create', async () => {
      const responseDto = makeResponseDto();
      service.create.mockResolvedValue(responseDto);

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toBe(responseDto);
    });

    it('propagates NotFoundException from service', async () => {
      service.create.mockRejectedValue(new NotFoundException('Network', NETWORK_ID));
      await expect(controller.create(dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('propagates ConflictException from service', async () => {
      service.create.mockRejectedValue(new ConflictException('duplicate symbol'));
      await expect(controller.create(dto)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // -------------------------------------------------------------------------
  // GET /tokens — findAll
  // -------------------------------------------------------------------------

  describe('findAll', () => {
    it('returns the paginated result from service', async () => {
      const paged = {
        data: [makeResponseDto()],
        total: 1, page: 1, limit: 20, totalPages: 1,
        hasNextPage: false, hasPreviousPage: false,
      };
      service.findAll.mockResolvedValue(paged);

      const query: TokenQueryDto = { page: 1, limit: 20 };
      const result = await controller.findAll(query);

      expect(service.findAll).toHaveBeenCalledWith(query);
      expect(result).toBe(paged);
    });

    it('passes filter parameters to service', async () => {
      const paged = { data: [], total: 0, page: 1, limit: 20, totalPages: 0, hasNextPage: false, hasPreviousPage: false };
      service.findAll.mockResolvedValue(paged);

      const query: TokenQueryDto = { networkId: NETWORK_ID, type: TokenType.CONTRACT, status: TokenStatus.ACTIVE };
      await controller.findAll(query);

      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  // -------------------------------------------------------------------------
  // GET /tokens/network/:networkId — findByNetworkId
  // -------------------------------------------------------------------------

  describe('findByNetworkId', () => {
    it('delegates to service.findByNetworkId', async () => {
      const paged = { data: [], total: 0, page: 1, limit: 20, totalPages: 0, hasNextPage: false, hasPreviousPage: false };
      service.findByNetworkId.mockResolvedValue(paged);

      await controller.findByNetworkId(NETWORK_ID, {});

      expect(service.findByNetworkId).toHaveBeenCalledWith(NETWORK_ID, {});
    });
  });

  // -------------------------------------------------------------------------
  // GET /tokens/:id — findById
  // -------------------------------------------------------------------------

  describe('findById', () => {
    it('returns the DTO for existing token', async () => {
      const dto = makeResponseDto();
      service.findById.mockResolvedValue(dto);

      const result = await controller.findById(TOKEN_ID);

      expect(service.findById).toHaveBeenCalledWith(TOKEN_ID);
      expect(result).toBe(dto);
    });

    it('propagates NotFoundException when token is missing', async () => {
      service.findById.mockRejectedValue(new NotFoundException('Token', TOKEN_ID));
      await expect(controller.findById(TOKEN_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /tokens/:id — update
  // -------------------------------------------------------------------------

  describe('update', () => {
    it('delegates to service.update and returns updated DTO', async () => {
      const dto: UpdateTokenDto = { name: 'USD Coin' };
      const updated = makeResponseDto({ name: 'USD Coin' });
      service.update.mockResolvedValue(updated);

      const result = await controller.update(TOKEN_ID, dto);

      expect(service.update).toHaveBeenCalledWith(TOKEN_ID, dto);
      expect(result.name).toBe('USD Coin');
    });

    it('propagates ConflictException from service', async () => {
      service.update.mockRejectedValue(new ConflictException('DEPRECATED is terminal'));
      await expect(controller.update(TOKEN_ID, {})).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /tokens/:id/enable — enable
  // -------------------------------------------------------------------------

  describe('enable', () => {
    it('delegates to service.enable', async () => {
      const dto = makeResponseDto({ status: TokenStatus.ACTIVE });
      service.enable.mockResolvedValue(dto);

      const result = await controller.enable(TOKEN_ID);

      expect(service.enable).toHaveBeenCalledWith(TOKEN_ID);
      expect(result.status).toBe(TokenStatus.ACTIVE);
    });

    it('propagates ConflictException for DEPRECATED token', async () => {
      service.enable.mockRejectedValue(new ConflictException('DEPRECATED is terminal'));
      await expect(controller.enable(TOKEN_ID)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /tokens/:id/disable — disable
  // -------------------------------------------------------------------------

  describe('disable', () => {
    it('delegates to service.disable', async () => {
      const dto = makeResponseDto({ status: TokenStatus.INACTIVE });
      service.disable.mockResolvedValue(dto);

      const result = await controller.disable(TOKEN_ID);

      expect(service.disable).toHaveBeenCalledWith(TOKEN_ID);
      expect(result.status).toBe(TokenStatus.INACTIVE);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /tokens/:id/deprecate — deprecate
  // -------------------------------------------------------------------------

  describe('deprecate', () => {
    it('delegates to service.deprecate', async () => {
      const dto = makeResponseDto({ status: TokenStatus.DEPRECATED });
      service.deprecate.mockResolvedValue(dto);

      const result = await controller.deprecate(TOKEN_ID);

      expect(service.deprecate).toHaveBeenCalledWith(TOKEN_ID);
      expect(result.status).toBe(TokenStatus.DEPRECATED);
    });

    it('propagates ConflictException when already DEPRECATED', async () => {
      service.deprecate.mockRejectedValue(new ConflictException('already deprecated'));
      await expect(controller.deprecate(TOKEN_ID)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /tokens/:id — remove
  // -------------------------------------------------------------------------

  describe('remove', () => {
    it('calls service.remove and returns void', async () => {
      service.remove.mockResolvedValue(undefined);

      const result = await controller.remove(TOKEN_ID);

      expect(service.remove).toHaveBeenCalledWith(TOKEN_ID);
      expect(result).toBeUndefined();
    });

    it('propagates NotFoundException for missing token', async () => {
      service.remove.mockRejectedValue(new NotFoundException('Token', TOKEN_ID));
      await expect(controller.remove(TOKEN_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  