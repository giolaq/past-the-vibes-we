import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { inflateSync } from "node:zlib";

/**
 * A screenshot gate for the Vega lifecycle. "A file arrived" is not evidence that the app
 * rendered: a crashed app still produces a PNG, and it is usually a single flat colour. This
 * module decodes the PNG itself — no image dependency — and judges whether the frame looks
 * like a rendered screen.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Channels per pixel for the non-palette PNG colour types a screenshooter emits. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };
/** Judge a strided sample instead of every pixel, so a 1080p frame costs milliseconds. */
const MAX_SAMPLES = 20_000;

export type DecodedImage = { width: number; height: number; channels: number; pixels: Buffer };

export function decodePng(buffer: Buffer): DecodedImage {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("not a PNG file");
  let header: { width: number; height: number; bitDepth: number; colorType: number; interlace: number } | undefined;
  const parts: Buffer[] = [];
  for (let offset = 8; offset + 8 <= buffer.length; ) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), bitDepth: body[8], colorType: body[9], interlace: body[12] };
    else if (type === "IDAT") parts.push(body);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (!header) throw new Error("PNG has no IHDR header");
  const channels = CHANNELS[header.colorType];
  if (!channels) throw new Error(`unsupported PNG colour type ${header.colorType}`);
  if (header.bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${header.bitDepth}`);
  if (header.interlace !== 0) throw new Error("interlaced PNG is not supported");
  if (!parts.length) throw new Error("PNG has no image data");
  return { width: header.width, height: header.height, channels, pixels: unfilter(inflateSync(Buffer.concat(parts)), header.width, header.height, channels) };
}

/** Reverses the five PNG scanline filters into flat 8-bit samples. */
function unfilter(raw: Buffer, width: number, height: number, channels: number): Buffer {
  const stride = width * channels;
  if (raw.length < height * (stride + 1)) throw new Error("PNG image data is truncated");
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw new Error(`unknown PNG scanline filter ${filter}`);
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const row = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? out[row + x - channels] : 0;
      const up = y > 0 ? out[row - stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? out[row - stride + x - channels] : 0;
      const value = line[x];
      out[row + x] = filter === 0 ? value
        : filter === 1 ? value + left
        : filter === 2 ? value + up
        : filter === 3 ? value + ((left + up) >> 1)
        : value + paeth(left, up, upLeft);
    }
  }
  return out;
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  return toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft;
}

export type ScreenshotThresholds = {
  minWidth: number;
  minHeight: number;
  minUniqueColors: number;
  minNonBlankRatio: number;
  minLuminance: number;
  maxLuminance: number;
};

/**
 * Deliberately loose. The gate exists to reject a placeholder pixel, a black frame, and a
 * single flat colour — not to review the design. A dark 10-foot UI must pass.
 */
export const SCREENSHOT_THRESHOLDS: ScreenshotThresholds = {
  minWidth: 640,
  minHeight: 360,
  minUniqueColors: 12,
  minNonBlankRatio: 0.05,
  minLuminance: 0.02,
  maxLuminance: 0.98,
};

export type ScreenshotEvaluation = {
  width: number;
  height: number;
  sampledPixels: number;
  uniqueColors: number;
  meanLuminance: number;
  nonBlankRatio: number;
  renders: boolean;
  reasons: string[];
};

export function evaluateScreenshot(buffer: Buffer, thresholds: Partial<ScreenshotThresholds> = {}): ScreenshotEvaluation {
  const limits = { ...SCREENSHOT_THRESHOLDS, ...thresholds };
  let image: DecodedImage;
  try {
    image = decodePng(buffer);
  } catch (error) {
    return { width: 0, height: 0, sampledPixels: 0, uniqueColors: 0, meanLuminance: 0, nonBlankRatio: 0, renders: false, reasons: [`screenshot could not be decoded: ${error instanceof Error ? error.message : String(error)}`] };
  }
  const measured = measure(image);
  const reasons: string[] = [];
  if (image.width < limits.minWidth || image.height < limits.minHeight) reasons.push(`frame is ${image.width}x${image.height}, smaller than the ${limits.minWidth}x${limits.minHeight} minimum for a device screen`);
  if (measured.uniqueColors < limits.minUniqueColors) reasons.push(`frame holds ${measured.uniqueColors} distinct colour${measured.uniqueColors === 1 ? "" : "s"}, under the ${limits.minUniqueColors} a rendered screen shows`);
  if (measured.nonBlankRatio < limits.minNonBlankRatio) reasons.push(`${Math.round((1 - measured.nonBlankRatio) * 100)}% of the frame is one flat colour`);
  if (measured.meanLuminance < limits.minLuminance) reasons.push(`frame is black (mean luminance ${measured.meanLuminance.toFixed(3)})`);
  if (measured.meanLuminance > limits.maxLuminance) reasons.push(`frame is blown out white (mean luminance ${measured.meanLuminance.toFixed(3)})`);
  return { width: image.width, height: image.height, ...measured, renders: reasons.length === 0, reasons };
}

export function evaluateScreenshotFile(path: string, thresholds: Partial<ScreenshotThresholds> = {}): ScreenshotEvaluation {
  if (!existsSync(path)) return { width: 0, height: 0, sampledPixels: 0, uniqueColors: 0, meanLuminance: 0, nonBlankRatio: 0, renders: false, reasons: [`no screenshot was written to ${path}`] };
  return evaluateScreenshot(readFileSync(path), thresholds);
}

/** One line of evidence for the lifecycle result, readable next to the check name. */
export function describeScreenshot(path: string, evaluation: ScreenshotEvaluation): string {
  if (!evaluation.width) return `${basename(path)}: ${evaluation.reasons[0] ?? "unreadable"}`;
  return `${basename(path)}: ${evaluation.width}x${evaluation.height}, ${evaluation.uniqueColors} colours, ${Math.round(evaluation.nonBlankRatio * 100)}% non-uniform, mean luminance ${evaluation.meanLuminance.toFixed(3)}`;
}

function measure(image: DecodedImage): { sampledPixels: number; uniqueColors: number; meanLuminance: number; nonBlankRatio: number } {
  const total = image.width * image.height;
  const step = Math.max(1, Math.floor(total / MAX_SAMPLES));
  const buckets = new Map<number, number>();
  let luminance = 0;
  let sampledPixels = 0;
  for (let index = 0; index < total; index += step) {
    const at = index * image.channels;
    const red = image.pixels[at];
    const green = image.channels >= 3 ? image.pixels[at + 1] : red;
    const blue = image.channels >= 3 ? image.pixels[at + 2] : red;
    luminance += 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    // Quantize to 5 bits per channel so sensor noise or gradients do not inflate the count.
    const bucket = ((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    sampledPixels += 1;
  }
  if (!sampledPixels) return { sampledPixels: 0, uniqueColors: 0, meanLuminance: 0, nonBlankRatio: 0 };
  const dominant = Math.max(...buckets.values());
  return {
    sampledPixels,
    uniqueColors: buckets.size,
    meanLuminance: luminance / sampledPixels / 255,
    nonBlankRatio: 1 - dominant / sampledPixels,
  };
}
