export default {
  testEnvironment: 'jsdom',

  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          verbatimModuleSyntax: false,
          module: 'ESNext',
          moduleResolution: 'bundler',
          jsx: 'react-jsx',
          target: 'ES2020',
          esModuleInterop: true,
          isolatedModules: false,
          allowJs: true,
          noUnusedParameters: false,
        },
      },
    ],
  },

  moduleNameMapper: {
    '\\.(scss|css)$': 'identity-obj-proxy',
    '^.+\\.svg(\\?react)?$': '<rootDir>/tests/__mocks__/svgMock.tsx',
    '^assets/(.*)$': '<rootDir>/src/assets/$1',
    '^components/(.*)$': '<rootDir>/src/components/$1',
    '^hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^types/(.*)$': '<rootDir>/src/types/$1',
    '^quill$': '<rootDir>/node_modules/quill/dist/quill.js',
    '^quill/(.*)$': '<rootDir>/node_modules/quill/dist/quill.js',
  },

  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  setupFilesAfterEnv: ['<rootDir>/tests/setupTests.ts'],
  testMatch: ['<rootDir>/tests/**/*.test.(ts|tsx)'],
};
