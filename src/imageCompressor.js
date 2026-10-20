/**
 * imageCompressor.js
 * Client-side image compression and validation for receipt & invoice uploads.
 * Keeps document sizes well below Firestore (1 MB) and IndexedDB limits while
 * preserving receipt legibility.
 */

export async function processInvoiceFile(file) {
  if (!file) throw new Error("No file provided");

  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";

  if (isImage) {
    return compressImage(file, { maxDimension: 1280, quality: 0.75 });
  }

  if (isPdf) {
    // 750 KB maximum limit for PDF to stay safely under Firestore 1 MB document ceiling
    const MAX_PDF_BYTES = 750 * 1024;
    if (file.size > MAX_PDF_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      throw new Error(
        `PDF statement is ${sizeMb} MB. Maximum allowed size for cloud sync is 750 KB. Please upload a compressed PDF or take a photo of the receipt.`
      );
    }
    const dataUrl = await readFileAsDataURL(file);
    return {
      dataUrl,
      thumbnail: null,
      size: file.size,
      type: "application/pdf",
      name: file.name,
    };
  }

  // Fallback for other file types
  const MAX_OTHER_BYTES = 750 * 1024;
  if (file.size > MAX_OTHER_BYTES) {
    throw new Error("File exceeds 750 KB maximum limit for cloud sync.");
  }
  const dataUrl = await readFileAsDataURL(file);
  return {
    dataUrl,
    thumbnail: null,
    size: file.size,
    type: file.type || "application/octet-stream",
    name: file.name,
  };
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function compressImage(file, options = {}) {
  const { maxDimension = 1280, quality = 0.75 } = options;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.onload = (loadEvent) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to load image for compression"));
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          // Main compressed image
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          // Force JPEG compression for photos/receipts
          const dataUrl = canvas.toDataURL("image/jpeg", quality);

          // Generate lightweight thumbnail (max 100px)
          let thumbWidth = width;
          let thumbHeight = height;
          const maxThumb = 100;
          if (thumbWidth > maxThumb || thumbHeight > maxThumb) {
            if (thumbWidth > thumbHeight) {
              thumbHeight = Math.round((thumbHeight * maxThumb) / thumbWidth);
              thumbWidth = maxThumb;
            } else {
              thumbWidth = Math.round((thumbWidth * maxThumb) / thumbHeight);
              thumbHeight = maxThumb;
            }
          }

          const thumbCanvas = document.createElement("canvas");
          thumbCanvas.width = thumbWidth;
          thumbCanvas.height = thumbHeight;
          const thumbCtx = thumbCanvas.getContext("2d");
          thumbCtx.drawImage(img, 0, 0, thumbWidth, thumbHeight);
          const thumbnail = thumbCanvas.toDataURL("image/jpeg", 0.6);

          const estimatedSize = Math.round((dataUrl.length * 3) / 4);

          resolve({
            dataUrl,
            thumbnail,
            size: estimatedSize,
            type: "image/jpeg",
            name: file.name.replace(/\.[^/.]+$/, ".jpg"),
            width,
            height,
          });
        } catch (err) {
          reject(err);
        }
      };
      img.src = loadEvent.target.result;
    };
    reader.readAsDataURL(file);
  });
}
