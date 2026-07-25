import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { scanDeviceLog } from "../src/platform/device-log.js";
import { decodePng, describeScreenshot, evaluateScreenshot, evaluateScreenshotFile } from "../src/platform/screenshot.js";
import { PLACEHOLDER_PIXEL_PNG } from "../src/platform/vega.js";

const RENDERED_FRAME = join(import.meta.dirname, "../../../workshop/fixtures/vega-lifecycle/launch-frame.png");

/** Builds a real PNG so the evaluator is tested through the decoder, not around it. */
function png(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue] = pixel(x, y);
      raw[row + 1 + x * 3] = red;
      raw[row + 2 + x * 3] = green;
      raw[row + 3 + x * 3] = blue;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function chunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  // The decoder never verifies the CRC, so a zero placeholder keeps this helper short.
  return Buffer.concat([length, Buffer.from(type, "ascii"), body, Buffer.alloc(4)]);
}

test("the rendered TV frame passes the screenshot gate", () => {
  const evaluation = evaluateScreenshotFile(RENDERED_FRAME);
  assert.equal(evaluation.renders, true, evaluation.reasons.join("; "));
  assert.equal(evaluation.width, 1280);
  assert.equal(evaluation.height, 720);
  assert.ok(evaluation.uniqueColors > 12, `only ${evaluation.uniqueColors} colours`);
  assert.match(describeScreenshot(RENDERED_FRAME, evaluation), /^launch-frame\.png: 1280x720, \d+ colours, \d+% non-uniform, mean luminance 0\.\d+$/);
});

test("the placeholder pixel is refused", () => {
  const evaluation = evaluateScreenshot(PLACEHOLDER_PIXEL_PNG);
  assert.equal(evaluation.renders, false);
  assert.match(evaluation.reasons.join(" "), /frame is 1x1, smaller than the 640x360 minimum/);
});

test("a black device screen is refused", () => {
  const evaluation = evaluateScreenshot(png(1280, 720, () => [0, 0, 0]));
  assert.equal(evaluation.renders, false);
  assert.match(evaluation.reasons.join(" "), /100% of the frame is one flat colour/);
  assert.match(evaluation.reasons.join(" "), /frame is black/);
});

test("a solid brand colour with a small spinner is refused", () => {
  const spinner = (x: number, y: number): [number, number, number] => (x > 630 && x < 650 && y > 350 && y < 370 ? [255, 255, 255] : [23, 107, 135]);
  const evaluation = evaluateScreenshot(png(1280, 720, spinner));
  assert.equal(evaluation.renders, false);
  assert.match(evaluation.reasons.join(" "), /of the frame is one flat colour/);
  assert.ok(evaluation.nonBlankRatio < 0.05, `nonBlankRatio ${evaluation.nonBlankRatio}`);
});

test("a dark 10-foot interface still passes", () => {
  // Mostly #101214, with rails and a hero: the shape of a real TV home screen.
  const surface = (x: number, y: number): [number, number, number] => {
    if (y < 300 && x > 40) return [23, 107, 135];
    if (y > 340 && y < 460) return [91 + (x % 40), 75, 138];
    if (y > 500 && y < 620) return [192, 87 + (x % 30), 70];
    return [16, 18, 20];
  };
  const evaluation = evaluateScreenshot(png(1280, 720, surface));
  assert.equal(evaluation.renders, true, evaluation.reasons.join("; "));
  assert.ok(evaluation.meanLuminance < 0.4, `luminance ${evaluation.meanLuminance}`);
});

test("a missing or unreadable screenshot is refused with a reason", () => {
  assert.match(evaluateScreenshotFile("/nonexistent/frame.png").reasons[0], /no screenshot was written to/);
  assert.match(evaluateScreenshot(Buffer.from("not an image")).reasons[0], /could not be decoded: not a PNG file/);
});

test("the decoder reverses every PNG scanline filter", () => {
  // deflate + a gradient exercises Sub, Up, Average, and Paeth through a real encoder.
  const gradient = png(64, 64, (x, y) => [x * 3, y * 3, (x + y) * 2]);
  const image = decodePng(gradient);
  assert.equal(image.width, 64);
  assert.equal(image.pixels[(10 * 64 + 5) * 3], 15);
  assert.equal(image.pixels[(10 * 64 + 5) * 3 + 1], 30);
  assert.equal(image.pixels[(10 * 64 + 5) * 3 + 2], 30);
});

test("device log scan reports the crash line, not just that it crashed", () => {
  const scan = scanDeviceLog("PocketCinema: started\nFATAL EXCEPTION: main\n  at PocketCinema.render\nSIGSEGV in libhermes.so");
  assert.equal(scan.crashed, true);
  assert.deepEqual(scan.matches, ["fatal exception: FATAL EXCEPTION: main", "native signal: SIGSEGV in libhermes.so"]);
});

test("device log scan passes a healthy launch", () => {
  const scan = scanDeviceLog(readFileSync(join(import.meta.dirname, "../../../workshop/fixtures/vega-lifecycle.json"), "utf8").match(/"stdout": "(00:00:03[^"]+)"/)![1].replace(/\\n/g, "\n"));
  assert.equal(scan.crashed, false);
  assert.equal(scan.lines, 6);
});

test("device log scan catches an unhandled JS error and an ANR", () => {
  assert.equal(scanDeviceLog("ReactNativeJS: Unhandled JS Exception: undefined is not a function").crashed, true);
  assert.equal(scanDeviceLog("ActivityManager: ANR in com.tvbuild.pocketcinema").crashed, true);
});
