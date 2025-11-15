/**
 * Mock helpers for Prisma client in tests
 */

export const createMockPrismaClient = () => ({
  connectionCheck: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn(),
  },
  outage: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  systemLog: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  user: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
  speedTest: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  monitoringTarget: {
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  settings: {
    findFirst: jest.fn(),
    upsert: jest.fn(),
  },
  $disconnect: jest.fn(),
});

export type MockPrismaClient = ReturnType<typeof createMockPrismaClient>;
