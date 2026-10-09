/**
 * Utility for client-side image compression and resizing before sending to server endpoints.
 */

interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  mimeType?: 'image/webp' | 'image/jpeg';
}

/**
 * Resizes and compresses a data URL or image URL string to WebP/JPEG format.
 * Max dimension defaults to 1024px.
 */
export async function compressImageString(
  imageStr: string,
  options: CompressOptions = {}
): Promise<string> {
  if (!imageStr) return imageStr;

  const {
    maxWidth = 1024,
    maxHeight = 1024,
    quality = 0.82,
    mimeType = 'image/webp',
  } = options;

  // Don't re-compress if it's already a tiny base64 data URL (< 150 KB)
  if (imageStr.startsWith('data:') && imageStr.length < 150000) {
    return imageStr;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions maintaining aspect ratio
      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      } else if (imageStr.startsWith('data:') && imageStr.length < 500000) {
        // Dimensions are small enough and payload reasonable
        resolve(imageStr);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(imageStr);
        return;
      }

      // Smooth scaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      try {
        let compressedDataUrl = canvas.toDataURL(mimeType, quality);
        // Fallback to jpeg if webp isn't supported or returned larger output
        if (!compressedDataUrl.startsWith(`data:${mimeType}`)) {
          compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(compressedDataUrl);
      } catch (err) {
        console.warn('Canvas export failed, using original image string:', err);
        resolve(imageStr);
      }
    };

    img.onerror = (err) => {
      console.warn('Failed to load image for compression, sending original:', err);
      resolve(imageStr);
    };

    img.src = imageStr;
  });
}

/**
 * Compresses an array of reference objects' image fields in parallel.
 */
export async function compressReferences<T extends { image: string }>(
  references: T[],
  options?: CompressOptions
): Promise<T[]> {
  return Promise.all(
    references.map(async (ref) => {
      try {
        const compressedImage = await compressImageString(ref.image, options);
        return { ...ref, image: compressedImage };
      } catch {
        return ref;
      }
    })
  );
}
