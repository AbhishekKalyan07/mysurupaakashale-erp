import { auth } from "@/shared/lib/firebase";

/**
 * Compresses and converts an uploaded payment screenshot to a lightweight
 * inline base64 image (<40 KB) suitable for storing in Firestore documents.
 *
 * Operates with ZERO dependency on Firebase Cloud Storage / Google Cloud billing,
 * keeping the application 100% compatible with the Firebase Spark plan.
 */
const MAX_SCREENSHOT_CHARS = 150000;

export async function uploadPaymentScreenshot(file: File): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Must be signed in to upload a payment screenshot.");
  }

  return new Promise((resolve, reject) => {
    // If running in Node/SSR/testing environment without DOM canvas
    if (typeof window === "undefined" || typeof document === "undefined") {
      file
        .arrayBuffer()
        .then((buf) => {
          const base64 = Buffer.from(buf).toString("base64");
          const res = `data:${file.type || "image/jpeg"};base64,${base64}`;
          if (res.length > MAX_SCREENSHOT_CHARS) {
            reject(
              new Error(
                "Screenshot image exceeds maximum allowed size (150 KB). Please upload a smaller photo.",
              ),
            );
            return;
          }
          resolve(res);
        })
        .catch(reject);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) {
        reject(new Error("Failed to read image file."));
        return;
      }

      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 600;
        let { width, height } = img;

        if (width > height && width > MAX_DIM) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else if (height > MAX_DIM) {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          if (dataUrl.length > MAX_SCREENSHOT_CHARS) {
            reject(
              new Error(
                "Screenshot image exceeds maximum allowed size (150 KB). Please upload a smaller photo.",
              ),
            );
            return;
          }
          resolve(dataUrl);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.6);
        if (compressedDataUrl.length > MAX_SCREENSHOT_CHARS) {
          reject(
            new Error(
              "Screenshot image could not be compressed below maximum allowed size (150 KB). Please upload a smaller photo.",
            ),
          );
          return;
        }
        resolve(compressedDataUrl);
      };

      img.onerror = () => {
        reject(
          new Error(
            "Failed to decode image file. Please upload a valid JPEG, PNG, or WebP photo.",
          ),
        );
      };

      img.src = dataUrl;
    };

    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}
