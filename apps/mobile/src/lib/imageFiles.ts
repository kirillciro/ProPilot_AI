import { File, Paths } from "expo-file-system";

// Samples the string so very long data URLs hash quickly.
const hash = (s: string) => {
  let h = 5381;
  const step = Math.max(1, Math.floor(s.length / 256));
  for (let i = 0; i < s.length; i += step)
    h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `${h.toString(36)}${s.length.toString(36)}`;
};

/** Returns a local file:// URI for a remote, data-URL or local image. */
export async function toLocalFile(url: string): Promise<string> {
  if (url.startsWith("file://")) return url;
  const file = new File(Paths.cache, `img-${hash(url)}.jpg`);
  if (file.exists) return file.uri;

  const base64 = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i.exec(url)?.[1];
  if (base64) {
    file.create();
    await file.write(base64, { encoding: "base64" });
    return file.uri;
  }
  await File.downloadFileAsync(url, file);
  return file.uri;
}

export async function saveToPhotos(url: string): Promise<void> {
  const uri = await toLocalFile(url);
  // Loaded lazily so an app build without the native module only fails when saving.
  const { Asset, requestPermissionsAsync } = await import("expo-media-library");
  const { granted } = await requestPermissionsAsync(true);
  if (!granted)
    throw new Error("Allow Photos access in Settings to save images.");
  await Asset.create(uri);
}
