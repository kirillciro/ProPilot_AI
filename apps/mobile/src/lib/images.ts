import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

const MAX_WIDTH = 1280;

/** Resizes and compresses a photo to a JPEG data URL, keeping uploads and token cost small. */
async function toDataUrl(uri: string) {
  const context = ImageManipulator.manipulate(uri, { maxWidth: MAX_WIDTH });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.7,
    base64: true,
  });
  return {
    previewUri: saved.uri,
    dataUrl: `data:image/jpeg;base64,${saved.base64}`,
    width: saved.width,
    height: saved.height,
  };
}

export const processImage = toDataUrl;

export type PickedImage = Awaited<ReturnType<typeof toDataUrl>>;

export async function takePhoto(): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 1,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? toDataUrl(asset.uri) : null;
}

export async function pickFromLibrary(): Promise<PickedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? toDataUrl(asset.uri) : null;
}
