module.exports = {
  preset: './node_modules/expo-module-scripts/node_modules/jest-expo/jest-preset.js',
  testEnvironment: 'node',
  transformIgnorePatterns: ['/node_modules/(?!(expo|expo-.*|expo-dev-client|expo-constants|expo-device|expo-notifications|expo-module-scripts|expo-modules-core|@expo|react-native|react-native-.*|@react-native|@unimodules|unimodules)/)'],
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json'],
  setupFiles: ['./jest.setup.js'],
};
