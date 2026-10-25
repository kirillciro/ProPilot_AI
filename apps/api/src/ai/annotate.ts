import sharp from "sharp";
import {
  ANNOTATION_FONT_SIZE,
  ANNOTATION_PEN_WIDTH,
  type Annotation,
} from "@propilot/shared";

const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Draws the user's marks onto a data-URL photo and returns the flattened JPEG as a data URL. */
export async function applyAnnotations(
  dataUrl: string,
  items: Annotation[],
): Promise<string> {
  const base64 = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i.exec(dataUrl)?.[1];
  if (!base64) throw new Error("annotations need a base64 data-URL image");

  const photo = sharp(Buffer.from(base64, "base64"));
  const { width = 0, height = 0 } = await photo.metadata();
  if (!width || !height) throw new Error("unreadable image");

  const pen = width * ANNOTATION_PEN_WIDTH;
  const font = width * ANNOTATION_FONT_SIZE;
  const shapes = items.map((item) => {
    if (item.kind === "text") {
      return (
        `<text x="${item.x * width}" y="${item.y * height}" fill="${item.color}" stroke="#000" ` +
        `stroke-width="${font * 0.04}" font-size="${font}" font-weight="bold" text-anchor="middle" ` +
        `font-family="Helvetica, Arial, sans-serif">${escapeXml(item.text)}</text>`
      );
    }
    const d =
      item.points.length === 1
        ? `M ${item.points[0]![0] * width} ${item.points[0]![1] * height} l 0.01 0`
        : item.points
            .map(([x, y], i) => `${i ? "L" : "M"} ${x * width} ${y * height}`)
            .join(" ");
    return `<path d="${d}" fill="none" stroke="${item.color}" stroke-width="${pen}" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${shapes.join("")}</svg>`;

  const out = await photo
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 80 })
    .toBuffer();
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}
