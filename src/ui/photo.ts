import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

/**
 * Keeps a summit photo. On a phone the GL snapshot lands in the cache, which the system can clear,
 * so it is copied into the app's documents. On the web the photo is already a data URL.
 */
export async function keepPhoto(uri: string | null): Promise<string | undefined> {
  if (!uri) return undefined;
  if (Platform.OS === 'web' || uri.startsWith('data:')) return uri;
  try {
    const src = new File(uri);
    const dest = new File(Paths.document, `summit-${Date.now()}.jpg`);
    await src.copy(dest);
    return dest.uri;
  } catch {
    return uri;
  }
}
