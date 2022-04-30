export type VideoElement = HTMLVideoElement & { srcObject?: MediaStream };
export type ImageElement = HTMLImageElement;
export type CanvasElement = HTMLCanvasElement;
export type ErrorLogger = (
  error: string | string[],
  isSlangError?: boolean
) => void;
export type TabsPackage = {
  onClickStill: () => void;
};
export type InputFeed = 'camera' | 'imageURL' | 'videoURL' | 'local';
export type BundlePackage = {
  HEIGHT: number;
  WIDTH: number;
  FPS: number;
  VOLUME: number;
  inputFeed: InputFeed;
};
export type Queue = () => void;
export type Video = {
  toReplString: () => string;
  init: (
    image: ImageElement,
    video: VideoElement,
    canvas: CanvasElement,
    errorLogger: ErrorLogger,
    tabsPackage: TabsPackage
  ) => BundlePackage;
  deinit: () => void;
  startVideo: () => void;
  snapPicture: () => void;
  updateFPS: (fps: number) => void;
  updateVolume: (volume: number) => void;
  updateDimensions: (width: number, height: number) => void;
};
export type Pixel = number[];
export type Pixels = Pixel[][];
export type Filter = (src: Pixels, dest: Pixels) => void;
