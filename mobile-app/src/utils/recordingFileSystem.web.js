export async function deleteAsync(uri, options) {
  // Web builds do not need native file-system deletion for temporary recordings.
  // This no-op keeps the same API shape while avoiding expo-file-system resolution on web.
  return Promise.resolve();
}
