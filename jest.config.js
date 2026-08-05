module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/src/test/**/*.test.ts'],
  collectCoverageFrom: [
    'src/main/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        baseUrl: './src',
        paths: {
          '@main/*': ['./main/*'],
        },
      },
    }],
  },
  moduleNameMapper: {
    '^@main/(.*)$': '<rootDir>/src/main/$1',
  },
};
