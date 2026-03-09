import sharp from 'sharp';
import { ProcessedImage } from '@/types';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_DIMENSION = 1568;
const TARGET_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

export async function processImage(raw: File): Promise<ProcessedImage> {
  const originalSize = raw.size;

  if (originalSize > MAX_FILE_SIZE_BYTES) {
    throw new Error('Image exceeds 10MB limit');
  }

  const arrayBuffer = await raw.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const mimeType = raw.type || 'image/jpeg';

  let sharpInstance = sharp(buffer);

  // Get metadata to check dimensions
  const metadata = await sharpInstance.metadata();
  const { width = 0, height = 0 } = metadata;

  // Resize if necessary
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    sharpInstance = sharpInstance.resize(MAX_DIMENSION, MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // Compress to JPEG for consistent output
  let quality = 85;
  let outputBuffer = await sharpInstance.jpeg({ quality }).toBuffer();

  // Reduce quality further if still over target size
  while (outputBuffer.length > TARGET_SIZE_BYTES && quality > 40) {
    quality -= 10;
    outputBuffer = await sharp(buffer)
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
  }

  const base64 = outputBuffer.toString('base64');
  const outputMimeType = 'image/jpeg';

  return {
    base64,
    mimeType: outputMimeType,
    originalSize,
    compressedSize: outputBuffer.length,
  };
}
