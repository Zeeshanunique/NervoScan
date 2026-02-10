/**
 * Face Processor — MediaPipe Face Mesh integration.
 * Extracts face landmarks and computes tension metrics locally.
 */

export interface FaceFeatures {
  landmarks: Array<{ x: number; y: number; z: number }>;
  tensionScore: number;
  eyeOpenness: number;
  browTension: number;
  lipCompression: number;
}

// Key landmark indices from MediaPipe Face Mesh
const LANDMARKS = {
  LEFT_EYE_TOP: 159,
  LEFT_EYE_BOTTOM: 145,
  RIGHT_EYE_TOP: 386,
  RIGHT_EYE_BOTTOM: 374,
  LEFT_BROW_INNER: 107,
  RIGHT_BROW_INNER: 336,
  UPPER_LIP: 13,
  LOWER_LIP: 14,
  LEFT_MOUTH: 61,
  RIGHT_MOUTH: 291,
  NOSE_TIP: 1,
  CHIN: 152,
};

export class FaceProcessor {
  private videoElement: HTMLVideoElement | null = null;
  private mediaStream: MediaStream | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private isRunning = false;

  // For basic face detection without MediaPipe (fallback)
  // MediaPipe Face Mesh is loaded asynchronously
  private faceMesh: any = null;
  private lastLandmarks: Array<{ x: number; y: number; z: number }> = [];

  async start(videoElement: HTMLVideoElement): Promise<void> {
    this.videoElement = videoElement;

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 15 },
      },
    });

    videoElement.srcObject = this.mediaStream;
    await videoElement.play();

    this.canvas = document.createElement("canvas");
    this.canvas.width = 640;
    this.canvas.height = 480;
    this.ctx = this.canvas.getContext("2d");

    this.isRunning = true;

    // Try to load MediaPipe (graceful fallback)
    await this.initFaceMesh();
  }

  private async initFaceMesh() {
    try {
      // @ts-ignore - MediaPipe loaded dynamically
      if (typeof window !== "undefined" && (window as any).FaceMesh) {
        const FaceMesh = (window as any).FaceMesh;
        this.faceMesh = new FaceMesh({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });
        this.faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        this.faceMesh.onResults((results: any) => {
          if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            this.lastLandmarks = results.multiFaceLandmarks[0].map(
              (lm: any) => ({ x: lm.x, y: lm.y, z: lm.z })
            );
          }
        });
      }
    } catch {
      // MediaPipe not available — we'll use canvas-based estimation
      console.log("MediaPipe Face Mesh not loaded, using canvas fallback");
    }
  }

  async extractFeatures(): Promise<FaceFeatures> {
    if (!this.videoElement || !this.ctx || !this.canvas) {
      return this.emptyFeatures();
    }

    // Draw current frame
    this.ctx.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height);

    // Try MediaPipe first
    if (this.faceMesh) {
      try {
        await this.faceMesh.send({ image: this.canvas });
        if (this.lastLandmarks.length >= 400) {
          return this.analyzeLandmarks(this.lastLandmarks);
        }
      } catch {
        // Fallback
      }
    }

    // Canvas brightness-based estimation fallback
    return this.canvasFallbackFeatures();
  }

  private analyzeLandmarks(landmarks: Array<{ x: number; y: number; z: number }>): FaceFeatures {
    const pts = landmarks;

    // Eye openness
    const leftEyeH = this.dist(pts[LANDMARKS.LEFT_EYE_TOP], pts[LANDMARKS.LEFT_EYE_BOTTOM]);
    const rightEyeH = this.dist(pts[LANDMARKS.RIGHT_EYE_TOP], pts[LANDMARKS.RIGHT_EYE_BOTTOM]);
    const eyeOpenness = (leftEyeH + rightEyeH) / 2;

    // Brow tension
    const leftBrow = this.dist(pts[LANDMARKS.LEFT_BROW_INNER], pts[LANDMARKS.LEFT_EYE_TOP]);
    const rightBrow = this.dist(pts[LANDMARKS.RIGHT_BROW_INNER], pts[LANDMARKS.RIGHT_EYE_TOP]);
    const browTension = (leftBrow + rightBrow) / 2;

    // Lip compression
    const lipV = this.dist(pts[LANDMARKS.UPPER_LIP], pts[LANDMARKS.LOWER_LIP]);
    const lipH = this.dist(pts[LANDMARKS.LEFT_MOUTH], pts[LANDMARKS.RIGHT_MOUTH]);
    const lipCompression = lipV / Math.max(lipH, 0.001);

    // Composite tension score
    let tensionScore = 50;
    if (eyeOpenness < 0.02) tensionScore += 15;
    else if (eyeOpenness < 0.03) tensionScore += 8;
    if (browTension < 0.03) tensionScore += 12;
    else if (browTension < 0.04) tensionScore += 6;
    if (lipCompression < 0.15) tensionScore += 10;
    else if (lipCompression < 0.25) tensionScore += 5;

    tensionScore = Math.max(0, Math.min(100, tensionScore));

    return { landmarks, tensionScore, eyeOpenness, browTension, lipCompression };
  }

  private canvasFallbackFeatures(): FaceFeatures {
    if (!this.ctx || !this.canvas) return this.emptyFeatures();

    // Analyze brightness variance in face region as proxy for tension
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const regionSize = 100;

    try {
      const imageData = this.ctx.getImageData(
        centerX - regionSize / 2,
        centerY - regionSize / 2,
        regionSize,
        regionSize
      );

      let brightnessSum = 0;
      let brightnessSquaredSum = 0;
      const pixelCount = imageData.data.length / 4;

      for (let i = 0; i < imageData.data.length; i += 4) {
        const brightness = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
        brightnessSum += brightness;
        brightnessSquaredSum += brightness * brightness;
      }

      const meanBrightness = brightnessSum / pixelCount;
      const variance = brightnessSquaredSum / pixelCount - meanBrightness * meanBrightness;

      // Webcam face region typically has variance in 200-3000 range.
      // Map conservatively since brightness variance is a very rough proxy.
      // Range 25-65: we can't confidently say more than "moderate" from pixels alone.
      const normalizedVariance = Math.min(1, Math.max(0, (variance - 200) / 2800));
      const tensionScore = 25 + normalizedVariance * 40;

      return {
        landmarks: [],
        tensionScore: Math.round(tensionScore * 10) / 10,
        eyeOpenness: 0,
        browTension: 0,
        lipCompression: 0,
      };
    } catch {
      return this.emptyFeatures();
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    this.videoElement = null;
    this.canvas = null;
    this.ctx = null;
    this.faceMesh = null;
  }

  private dist(a: { x: number; y: number; z?: number }, b: { x: number; y: number; z?: number }): number {
    return Math.sqrt(
      (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((a.z || 0) - (b.z || 0)) ** 2
    );
  }

  private emptyFeatures(): FaceFeatures {
    return { landmarks: [], tensionScore: 0, eyeOpenness: 0, browTension: 0, lipCompression: 0 };
  }
}
