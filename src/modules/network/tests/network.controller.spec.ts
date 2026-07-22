import { Test, TestingModule } from '@nestjs/testing';
import { NetworkController } from '../controllers/network.controller';
import { NetworkService } from '../services/network.service';
import { NetworkDriver } from '../enums/network-driver.enum';
import { NotFoundException } from '@core/exceptions/not-found.exception';
import { ConflictException } from '@core/exceptions/conflict.exception';
import type { CreateNetworkDto } from '../dto/create-network.dto';
import type { UpdateNetworkDto } from '../dto/update-network.dto';
import type { NetworkResponseDto } from '../dto/network-response.dto';
import type { PaginatedResult } from '@common/pagination/paginated-result.type';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID = 'aaaaaaaa-0000-0000-0000-000000000001';

const makeResponseDto = (overrides: Partial<NetworkResponseDto> = {}): NetworkResponseDto =>
  ({
    id: UUID,
    name: 'Ethereum',
    slug: 'ethereum-mainnet',
    symbol: 'ETH',
    chainId: '1',
    nativeDecimals: 18,
    driverKey: NetworkDriver.EVM,
    explorerBaseUrl: 'https://etherscan.io',
    requiredConfirmations: 12,
    blockTimeSeconds: 12,
    isTestnet: false,
    isActive: true,
    description: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  } as NetworkResponseDto);

const makePaginatedResult = (
  items: NetworkResponseDto[] = [],
): PaginatedResult<NetworkResponseDto> => ({
  data: items,
  total: items.length,
  page: 1,
  limit: 20,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('NetworkController', () => {
  let controller: NetworkController;
  let service: jest.Mocked<NetworkService>;

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      findBySlug: jest.fn(),
      findActive: jest.fn(),
      isActive: jest.fn(),
      getDriverKey: jest.fn(),
      getRequiredConfirmations: jest.fn(),
      getExplorerUrl: jest.fn(),
      update: jest.fn(),
      activate: jest.fn(),
      deactivate: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<NetworkService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NetworkController],
      providers: [{ provide: NetworkService, useValue: service }],
    }).compile();

    controller = module.get(NetworkController);
  });

  // -------------------------------------------------------------------------
  // POST /networks — create
  // -------------------------------------------------------------------------
  describe('create', () => {
    const dto: CreateNetworkDto = {
      name: 'Ethereum',
      slug: 'ethereum-mainnet',
      symbol: 'ETH',
      chainId: '1',
      nativeDecimals: 18,
      driverKey: NetworkDriver.EVM,
      explorerBaseUrl: 'https://etherscan.io',
    };

    it('delegates to NetworkService.create and returns the result', async () => {
      const response = makeResponseDto();
      service.create.mockResolvedValueOnce(response);

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(response);
    });

    it('propagates ConflictException thrown by the service', async () => {
      service.create.mockRejectedValueOnce(
        new ConflictException("A network with slug 'ethereum-mainnet' already exists"),
      );

      await expect(controller.create(dto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('calls the service exactly once', async () => {
      service.create.mockResolvedValueOnce(makeResponseDto());

      await controller.create(dto);

      expect(service.create).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // GET /networks — findAll
  // -------------------------------------------------------------------------
  describe('findAll', () => {
    it('delegates to NetworkService.findAll and returns paginated result', async () => {
      const paged = makePaginatedResult([makeResponseDto()]);
      service.findAll.mockResolvedValueOnce(paged);

      const result = await controller.findAll({ page: 1, limit: 20 });

      expect(service.findAll).toHaveBeenCalledWith({ page: 1, limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('forwards filter parameters to the service', async () => {
      const paged = makePaginatedResult();
      service.findAll.mockResolvedValueOnce(paged);

      const query = {
        page: 1,
        limit: 10,
        driverKey: NetworkDriver.TRON,
        isActive: true,
        isTestnet: false,
      };
      await controller.findAll(query);

      expect(service.findAll).toHaveBeenCalledWith(query);
    });

    it('returns an empty paginated result when no networks match', async () => {
      service.findAll.mockResolvedValueOnce(makePaginatedResult());

      const result = await controller.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // GET /networks/slug/:slug — findBySlug
  // -------------------------------------------------------------------------
  describe('findBySlug', () => {
    it('delegates to NetworkService.findBySlug with the slug param', async () => {
      const response = makeResponseDto();
      service.findBySlug.mockResolvedValueOnce(response);

      const result = await controller.findBySlug('ethereum-mainnet');

      expect(service.findBySlug).toHaveBeenCalledWith('ethereum-mainnet');
      expect(result).toEqual(response);
    });

    it('propagates NotFoundException thrown by the service', async () => {
      service.findBySlug.mockRejectedValueOnce(new NotFoundException('Network', 'missing-slug'));

      await expect(controller.findBySlug('missing-slug')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // GET /networks/:id — findById
  // -------------------------------------------------------------------------
  describe('findById', () => {
    it('delegates to NetworkService.findById with the UUID param', async () => {
      const response = makeResponseDto();
      service.findById.mockResolvedValueOnce(response);

      const result = await controller.findById(UUID);

      expect(service.findById).toHaveBeenCalledWith(UUID);
      expect(result).toEqual(response);
    });

    it('propagates NotFoundException thrown by the service', async () => {
      service.findById.mockRejectedValueOnce(new NotFoundException('Network', UUID));

      await expect(controller.findById(UUID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /networks/:id — update
  // -------------------------------------------------------------------------
  describe('update', () => {
    it('delegates to NetworkService.update with id and dto', async () => {
      const response = makeResponseDto({ name: 'Ethereum Mainnet' });
      service.update.mockResolvedValueOnce(response);

      const dto: UpdateNetworkDto = { name: 'Ethereum Mainnet' };
      const result = await controller.update(UUID, dto);

      expect(service.update).toHaveBeenCalledWith(UUID, dto);
      expect(result.name).toBe('Ethereum Mainnet');
    });

    it('propagates NotFoundException when the network does not exist', async () => {
      service.update.mockRejectedValueOnce(new NotFoundException('Network', UUID));

      await expect(controller.update(UUID, { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /networks/:id/activate — activate
  // -------------------------------------------------------------------------
  describe('activate', () => {
    it('delegates to NetworkService.activate and returns the result', async () => {
      const response = makeResponseDto({ isActive: true });
      service.activate.mockResolvedValueOnce(response);

      const result = await controller.activate(UUID);

      expect(service.activate).toHaveBeenCalledWith(UUID);
      expect(result.isActive).toBe(true);
    });

    it('propagates NotFoundException when the network does not exist', async () => {
      service.activate.mockRejectedValueOnce(new NotFoundException('Network', UUID));

      await expect(controller.activate(UUID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /networks/:id/deactivate — deactivate
  // -------------------------------------------------------------------------
  describe('deactivate', () => {
    it('delegates to NetworkService.deactivate and returns the result', async () => {
      const response = makeResponseDto({ isActive: false });
      service.deactivate.mockResolvedValueOnce(response);

      const result = await controller.deactivate(UUID);

      expect(service.deactivate).toHaveBeenCalledWith(UUID);
      expect(result.isActive).toBe(false);
    });

    it('propagates NotFoundException when the network does not exist', async () => {
      service.deactivate.mockRejectedValueOnce(new NotFoundException('Network', UUID));

      await expect(controller.deactivate(UUID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /networks/:id — remove (soft-delete)
  // -------------------------------------------------------------------------
  describe('remove', () => {
    it('delegates to NetworkService.remove and returns void', async () => {
      service.remove.mockResolvedValueOnce(undefined);

      const result = await controller.remove(UUID);

      expect(service.remove).toHaveBeenCalledWith(UUID);
      expect(result).toBeUndefined();
    });

    it('propagates NotFoundException when the network does not exist', async () => {
      service.remove.mockRejectedValueOnce(new NotFoundException('Network', UUID));

      await expect(controller.remove(UUID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('calls the service exactly once', async () => {
      service.remove.mockResolvedValueOnce(undefined);

      await controller.remove(UUID);

      expect(service.remove).toHaveBeenCalledTimes(1);
    });
  });
});
