import { deflateSync, crc32 } from "node:zlib";
import { chatOnce, fetchVisionModels } from "../src/ai/openrouter.js";

function pngChunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Solid red RGB PNG, so the model's answer is easy to verify. */
function solidRedPng(size = 64) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array(size).fill([255, 0, 0]).flat()),
  ]);
  const raw = Buffer.concat(Array(size).fill(row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const model = process.env.SMOKE_MODEL ?? "google/gemma-4-31b-it:free";

const models = await fetchVisionModels();
console.log(
  `Vision-capable chat models: ${models.length} (free: ${models.filter((m) => Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0).length})`,
);
console.log(`Target model in catalog: ${models.some((m) => m.id === model)}`);

const dataUrl = `data:image/png;base64,${solidRedPng().toString("base64")}`;
const { text, usage } = await chatOnce({
  model,
  maxTokens: 200,
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "What single color fills this image? Answer in one word.",
        },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    },
  ],
});

console.log(`Model: ${model}`);
console.log(`Answer: ${text.trim()}`);
console.log("Usage:", JSON.stringify(usage));
