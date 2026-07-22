import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  const healthCheckServiceMock = { check: jest.fn() };
  const typeOrmHealthIndicatorMock = { pingCheck: jest.fn() };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckServiceMock },
        { provide: TypeOrmHealthIndicator, useValue: typeOrmHealthIndicatorMock },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should delegate the health check to HealthCheckService with a database indicator', async () => {
    healthCheckServiceMock.check.mockResolvedValue({ status: 'ok', info: {}, error: {}, details: {} });

    await controller.check();

    expect(healthCheckServiceMock.check).toHaveBeenCalledTimes(1);
    const [indicators] = healthCheckServiceMock.check.mock.calls[0] as [Array<() => unknown>];
    expect(indicators).toHaveLength(1);
  });
});
