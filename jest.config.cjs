module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(spec|test).ts', '**/?(*.)+(spec|test).tsx'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }]
  },
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  maxWorkers: process.env.JEST_MAX_WORKERS ? Number(process.env.JEST_MAX_WORKERS) : 1,
  moduleNameMapper: {
    '^next/link$': '<rootDir>/apps/web/src/__tests__/mocks/nextLink.tsx',
    '^next/font/google$': '<rootDir>/apps/web/src/__tests__/mocks/nextFont.ts'
  },
  collectCoverageFrom: ['apps/api/src/**/*.{ts,tsx}', 'apps/web/src/**/*.{ts,tsx}'],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      lines: 90,
      statements: 90,
      functions: 95,
      branches: 80
    }
  }
};
