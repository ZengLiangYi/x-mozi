/**
 * Type declarations for @mediapipe/tasks-vision
 */
declare module '@mediapipe/tasks-vision' {
  export interface Detection {
    boundingBox?: {
      originX: number;
      originY: number;
      width: number;
      height: number;
    };
    categories?: Array<{
      index: number;
      score: number;
      categoryName: string;
      displayName: string;
    }>;
    keypoints?: Array<{
      x: number;
      y: number;
      label?: string;
      score?: number;
    }>;
  }

  export interface FaceDetectorResult {
    detections: Detection[];
  }

  export interface FaceDetectorOptions {
    baseOptions?: {
      modelAssetPath?: string;
      delegate?: 'CPU' | 'GPU';
    };
    runningMode?: 'IMAGE' | 'VIDEO';
    minDetectionConfidence?: number;
    minSuppressionThreshold?: number;
  }

  export class FaceDetector {
    static createFromOptions(
      vision: FilesetResolver,
      options: FaceDetectorOptions
    ): Promise<FaceDetector>;

    detect(image: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): FaceDetectorResult;
    detectForVideo(video: HTMLVideoElement, timestamp: number): FaceDetectorResult;
    close(): void;
  }

  // Object Detector - 可检测人体等多种物体
  export interface ObjectDetectorResult {
    detections: Detection[];
  }

  export interface ObjectDetectorOptions {
    baseOptions?: {
      modelAssetPath?: string;
      delegate?: 'CPU' | 'GPU';
    };
    runningMode?: 'IMAGE' | 'VIDEO';
    scoreThreshold?: number;
    maxResults?: number;
    categoryAllowlist?: string[];
    categoryDenylist?: string[];
  }

  export class ObjectDetector {
    static createFromOptions(
      vision: FilesetResolver,
      options: ObjectDetectorOptions
    ): Promise<ObjectDetector>;

    detect(image: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): ObjectDetectorResult;
    detectForVideo(video: HTMLVideoElement, timestamp: number): ObjectDetectorResult;
    close(): void;
  }

  export class FilesetResolver {
    static forVisionTasks(wasmFilePath: string): Promise<FilesetResolver>;
  }
}
