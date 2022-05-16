/**
 * The pix_n_flix library allows us to process still images and video. Each Image is a
 * two-dimensional array of Pixels, and a Pixel consists of red, blue and green color
 * values, each ranging from 0 and 255. To access these color values of a Pixel, we
 * provide the functions red_of, blue_of and green_of.
 *
 * A central element of pix_n_flix is the notion of a Filter, a function that is applied
 * to two images: the source Image and the destination Image. We can install a given
 * Filter to be used to transform the Images that the camera captures or from a local video file
 * into images displayed on the output screen by using the function install_filter. The output
 * screen is shown in the Source Academy in the tab with the "Video Display" icon (camera).
 *
 * The size of the output screen can be changed by the user. To access the current size of the
 * output screen, we provide the functions video_height and video_width.
 *
 * @module pix_n_flix
 */

import {
  CanvasElement,
  VideoElement,
  ErrorLogger,
  StartPacket,
  Pixel,
  Pixels,
  Filter,
  Queue,
  TabsPacket,
  BundlePacket,
  InputFeed,
  ImageElement,
} from './types';

import {
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  DEFAULT_FPS,
  DEFAULT_VOLUME,
  MAX_HEIGHT,
  MIN_HEIGHT,
  MAX_WIDTH,
  MIN_WIDTH,
  MAX_FPS,
  MIN_FPS,
} from './constants';

// Global Variables
let WIDTH: number = DEFAULT_WIDTH;
let HEIGHT: number = DEFAULT_HEIGHT;
let FPS: number = DEFAULT_FPS;
let VOLUME: number = DEFAULT_VOLUME;

let imageElement: ImageElement;
let videoElement: VideoElement;
let canvasElement: CanvasElement;
let canvasRenderingContext: CanvasRenderingContext2D;
let errorLogger: ErrorLogger;
let tabsPackage: TabsPacket;

const pixels: Pixels = [];
const temporaryPixels: Pixels = [];
// eslint-disable-next-line @typescript-eslint/no-use-before-define
let filter: Filter = copy_image;

let toRunLateQueue: boolean = false;
let videoIsPlaying: boolean = false;

let requestId: number;
let startTime: number;

let inputFeed: InputFeed = InputFeed.Camera;
let url: string = '';

// =============================================================================
// Module's Private Functions
// =============================================================================

/** @hidden */
function setupData(): void {
  for (let i = 0; i < HEIGHT; i += 1) {
    pixels[i] = [];
    temporaryPixels[i] = [];
    for (let j = 0; j < WIDTH; j += 1) {
      pixels[i][j] = [0, 0, 0, 255];
      temporaryPixels[i][j] = [0, 0, 0, 255];
    }
  }
}

/** @hidden */
function isPixelFilled(pixel: Pixel): boolean {
  let ok = true;
  for (let i = 0; i < 4; i += 1) {
    if (pixel[i] >= 0 && pixel[i] <= 255) {
      // eslint-disable-next-line no-continue
      continue;
    }
    ok = false;
    // eslint-disable-next-line no-param-reassign
    pixel[i] = 0;
  }
  return ok;
}

/** @hidden */
function writeToBuffer(buffer: Uint8ClampedArray, data: Pixels) {
  let ok: boolean = true;

  for (let i = 0; i < HEIGHT; i += 1) {
    for (let j = 0; j < WIDTH; j += 1) {
      const p = i * WIDTH * 4 + j * 4;
      if (isPixelFilled(data[i][j]) === false) {
        ok = false;
      }
      // eslint-disable-next-line no-param-reassign, prefer-destructuring
      buffer[p] = data[i][j][0];
      // eslint-disable-next-line no-param-reassign, prefer-destructuring
      buffer[p + 1] = data[i][j][1];
      // eslint-disable-next-line no-param-reassign, prefer-destructuring
      buffer[p + 2] = data[i][j][2];
      // eslint-disable-next-line no-param-reassign, prefer-destructuring
      buffer[p + 3] = data[i][j][3];
    }
  }

  if (!ok) {
    const warningMessage =
      'You have invalid values for some pixels! Reseting them to default (0)';
    // eslint-disable-next-line no-console
    console.warn(warningMessage);
    errorLogger(warningMessage, false);
  }
}

/** @hidden */
function readFromBuffer(pixelData: Uint8ClampedArray, src: Pixels) {
  for (let i = 0; i < HEIGHT; i += 1) {
    for (let j = 0; j < WIDTH; j += 1) {
      const p = i * WIDTH * 4 + j * 4;
      // eslint-disable-next-line no-param-reassign
      src[i][j] = [
        pixelData[p],
        pixelData[p + 1],
        pixelData[p + 2],
        pixelData[p + 3],
      ];
    }
  }
}

/** @hidden */
function drawFrame(source: VideoElement | ImageElement): void {
  canvasRenderingContext.drawImage(source, 0, 0, WIDTH, HEIGHT);
  const pixelObj = canvasRenderingContext.getImageData(0, 0, WIDTH, HEIGHT);
  readFromBuffer(pixelObj.data, pixels);

  // Runtime checks to guard against crashes
  try {
    filter(pixels, temporaryPixels);
    writeToBuffer(pixelObj.data, temporaryPixels);
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(e));
    const errMsg = `There is an error with filter function, filter will be reset to default. ${e.name}: ${e.message}`;
    // eslint-disable-next-line no-console
    console.error(errMsg);

    if (!e.name) {
      errorLogger(
        'There is an error with filter function (error shown below). Filter will be reset back to the default. If you are facing an infinite loop error, you can consider increasing the timeout period (clock icon) at the top / reducing the video dimensions.'
      );

      errorLogger([e], true);
    } else {
      errorLogger(errMsg, false);
    }

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    filter = copy_image;
    filter(pixels, temporaryPixels);
  }

  canvasRenderingContext.putImageData(pixelObj, 0, 0);
}

/** @hidden */
function draw(timestamp: number): void {
  // eslint-disable-next-line no-unused-vars
  requestId = window.requestAnimationFrame(draw);

  if (startTime == null) startTime = timestamp;

  const elapsed = timestamp - startTime;
  if (elapsed > 1000 / FPS && videoIsPlaying) {
    drawFrame(videoElement);
    startTime = timestamp;
    if (toRunLateQueue) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      lateQueue();
      toRunLateQueue = false;
    }
  }
}

/** @hidden */
async function playVideoElement() {
  if (videoElement.paused && !videoIsPlaying) {
    return videoElement.play();
  }
  return null;
}

/** @hidden */
function pauseVideoElement() {
  if (!videoElement.paused && videoIsPlaying) {
    videoElement.pause();
  }
}

/** @hidden */
function startVideo(): void {
  if (videoIsPlaying) return;
  if (inputFeed === InputFeed.Camera) {
    videoIsPlaying = true;
  } else {
    playVideoElement();
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  requestId = window.requestAnimationFrame(draw);
}

/**
 * Stops the loop that is drawing on frame.
 *
 * @hidden
 */
function stopVideo(): void {
  if (!videoIsPlaying) return;
  if (inputFeed === InputFeed.Camera) {
    videoIsPlaying = false;
  } else {
    pauseVideoElement();
  }
  window.cancelAnimationFrame(requestId);
}

/** @hidden */
function loadMedia(): void {
  if (!navigator.mediaDevices.getUserMedia) {
    const errMsg = 'The browser you are using does not support getUserMedia';
    // eslint-disable-next-line no-console
    console.error(errMsg);
    errorLogger(errMsg, false);
  }

  // If video is already part of bundle state
  if (videoElement.srcObject != null) return;

  navigator.mediaDevices
    .getUserMedia({ video: true })
    .then((stream) => {
      videoElement.srcObject = stream;
      toRunLateQueue = true;
    })
    .catch((error) => {
      const errorMessage = `${error.name}: ${error.message}`;
      // eslint-disable-next-line no-console
      console.error(errorMessage);
      errorLogger(errorMessage, false);
    });

  startVideo();
}

/** @hidden */
function loadAlternative(): void {
  try {
    if (inputFeed === InputFeed.VideoURL) {
      videoElement.src = url;
      startVideo();
    } else if (inputFeed === InputFeed.ImageURL) {
      imageElement.src = url;
    }
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(e));
    const errMsg = `There is an error loading the URL. ${e.name}: ${e.message}`;
    // eslint-disable-next-line no-console
    console.error(errMsg);
    loadMedia();
    return;
  }
  toRunLateQueue = true;
  videoElement.crossOrigin = 'anonymous';
  videoElement.loop = true;
  videoElement.onplaying = () => {
    videoIsPlaying = true;
  };
  videoElement.onpause = () => {
    videoIsPlaying = false;
  };
  imageElement.crossOrigin = 'anonymous';
  imageElement.onload = () => {
    drawFrame(imageElement);
  };
}

/**
 * Just draws once on frame and stops video.
 *
 * @hidden
 */
function snapPicture(): void {
  drawFrame(imageElement);
  stopVideo();
}

/**
 * Update the FPS
 *
 * @hidden
 */
function updateFPS(fps: number): void {
  if (fps < MIN_FPS || fps > MAX_FPS) return;
  FPS = fps;
}

/**
 * Update the frame dimensions.
 *
 * @hidden
 */
function updateDimensions(w: number, h: number): void {
  // ignore if no change or bad inputs
  if (
    (w === WIDTH && h === HEIGHT) ||
    w > MAX_WIDTH ||
    w < MIN_WIDTH ||
    h > MAX_HEIGHT ||
    h < MIN_HEIGHT
  ) {
    return;
  }

  const status = videoIsPlaying;
  stopVideo();

  WIDTH = w;
  HEIGHT = h;

  videoElement.width = w;
  videoElement.height = h;
  canvasElement.width = w;
  canvasElement.height = h;

  setupData();

  if (!status) {
    setTimeout(() => snapPicture(), 50);
    return;
  }

  startVideo();
}

/**
 * Updates the volume of the local video
 *
 * @hidden
 */
function updateVolume(v: number): void {
  VOLUME = Math.max(0.0, Math.min(1.0, v));
  videoElement.volume = VOLUME;
}

// queue is run when init is called
let queue: Queue = () => {};

/**
 * Adds function to the queue
 *
 * @hidden
 */
function enqueue(funcToAdd: Queue): void {
  const funcToRunFirst: Queue = queue;
  queue = () => {
    funcToRunFirst();
    funcToAdd();
  };
}

// lateQueue is run after media has properly loaded
let lateQueue: Queue = () => {};

/**
 * Adds function to the lateQueue
 *
 * @hidden
 */
function lateEnqueue(funcToAdd: Queue): void {
  const funcToRunFirst: Queue = lateQueue;
  lateQueue = () => {
    funcToRunFirst();
    funcToAdd();
  };
}

/**
 * Used to initialise the video library.
 *
 * @returns a BundlePackage object containing Video's properties
 *     and other miscellaneous information relevant to tabs.
 * @hidden
 */
function init(
  image: ImageElement,
  video: VideoElement,
  canvas: CanvasElement,
  _errorLogger: ErrorLogger,
  _tabsPackage: TabsPacket
): BundlePacket {
  imageElement = image;
  videoElement = video;
  canvasElement = canvas;
  errorLogger = _errorLogger;
  tabsPackage = _tabsPackage;
  const context = canvasElement.getContext('2d');
  if (context == null) throw new Error('Canvas context should not be null.');
  canvasRenderingContext = context;
  setupData();
  if (inputFeed === InputFeed.Camera) {
    loadMedia();
  } else {
    loadAlternative();
  }
  queue();
  return { HEIGHT, WIDTH, FPS, VOLUME, inputFeed };
}

/**
 * Destructor that does necessary cleanup.
 *
 * @hidden
 */
function deinit(): void {
  snapPicture();
  const stream = videoElement.srcObject;
  if (!stream) {
    return;
  }
  stream.getTracks().forEach((track) => {
    track.stop();
  });
}

// =============================================================================
// Module's Exposed Functions
// =============================================================================

/**
 * Initialize the PixNFlix live feed with default globals.
 */
export function start(): StartPacket {
  return {
    toReplString: () => '[Pix N Flix]',
    init,
    deinit,
    startVideo,
    snapPicture,
    updateFPS,
    updateVolume,
    updateDimensions,
  };
}

/**
 * Returns the red component of a given Pixel.
 *
 * @param pixel Given Pixel
 * @returns The red component as a number between 0 and 255
 */
export function red_of(pixel: Pixel): number {
  // returns the red value of pixel respectively
  return pixel[0];
}

/**
 * Returns the green component of a given Pixel.
 *
 * @param pixel Given Pixel
 * @returns The green component as a number between 0 and 255
 */
export function green_of(pixel: Pixel): number {
  // returns the green value of pixel respectively
  return pixel[1];
}

/**
 * Returns the blue component of a given Pixel.
 *
 * @param pixel Given Pixel
 * @returns The blue component as a number between 0 and 255
 */
export function blue_of(pixel: Pixel): number {
  // returns the blue value of pixel respectively
  return pixel[2];
}

/**
 * Returns the alpha component of a given Pixel.
 *
 * @param pixel Given Pixel
 * @returns The alpha component as a number between 0 and 255
 */
export function alpha_of(pixel: Pixel): number {
  // returns the alpha value of pixel respectively
  return pixel[3];
}

/**
 * Assigns the red, green, blue and alpha components of a pixel
 * to given values.
 *
 * @param pixel Given Pixel
 * @param r The red component as a number between 0 and 255
 * @param g The green component as a number between 0 and 255
 * @param b The blue component as a number between 0 and 255
 * @param a The alpha component as a number between 0 and 255
 */
export function set_rgba(
  pixel: Pixel,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  // assigns the r,g,b values to this pixel
  // eslint-disable-next-line no-param-reassign
  pixel[0] = r;
  // eslint-disable-next-line no-param-reassign
  pixel[1] = g;
  // eslint-disable-next-line no-param-reassign
  pixel[2] = b;
  // eslint-disable-next-line no-param-reassign
  pixel[3] = a;
}

/**
 * Returns the current height of the output video display in
 * pixels, i.e. the number of pixels in vertical direction.
 *
 * @returns height of output display (in pixels)
 */
export function video_height(): number {
  return HEIGHT;
}

/**
 * Returns the current width of the output video display in
 * pixels, i.e. the number of pixels in horizontal direction.
 *
 * @returns Width of output display (in pixels)
 */
export function video_width(): number {
  return WIDTH;
}

/**
 * The default filter that just copies the input 2D
 * grid to output.
 *
 * @param src 2D input src of pixels
 * @param dest 2D output src of pixels
 */
export function copy_image(src: Pixels, dest: Pixels): void {
  for (let i = 0; i < HEIGHT; i += 1) {
    for (let j = 0; j < WIDTH; j += 1) {
      // eslint-disable-next-line no-param-reassign
      dest[i][j] = src[i][j];
    }
  }
}

/**
 * Installs a given filter to be used to transform
 * the images from either the video file uploaded or from the camera feed
 * into images displayed on the screen.
 *
 * A filter is a function that is applied to two
 * two-dimensional arrays of Pixels:
 * the source image and the destination image.
 *
 * @param filter - Filter to be installed
 */
export function install_filter(_filter: Filter): void {
  filter = _filter;
}

/**
 * Resets any filter applied on the video.
 */
export function reset_filter(): void {
  install_filter(copy_image);
}

/**
 * Returns a new filter that is the result of applying both
 * filter1 and filter2 together.
 *
 * @param filter1 First filter
 * @param filter2 Second filter
 * @returns Filter after applying filter1 and filter2
 */
export function compose_filter(filter1: Filter, filter2: Filter): Filter {
  return (src, dest) => {
    filter1(src, dest);
    copy_image(dest, src);
    filter2(src, dest);
  };
}

/**
 * Pauses the video after a set delay.
 *
 * @param delay Delay in ms after the video starts.
 */
export function pause_at(delay: number): void {
  // prevent negative delays
  lateEnqueue(() => {
    setTimeout(tabsPackage.onClickStill, delay >= 0 ? delay : -delay);
  });
}

/**
 * Sets height of video frame.
 * Note: Only accepts height and width within the range of 1 and 500.
 *
 * @param width Width of video (Default value of 300)
 * @param height Height of video (Default value of 400)
 */
export function set_dimensions(width: number, height: number): void {
  enqueue(() => updateDimensions(width, height));
}

/**
 * Sets frames per second (FPS) of the video.
 * Note: Only accepts FPS values within the range of 2 to 30.
 *
 * @param fps FPS of video (Default value of 10)
 */
export function set_fps(fps: number): void {
  enqueue(() => updateFPS(fps));
}

/**
 * Sets the audio volume of the local video file played.
 * Note: Only accepts volume value within the range of 0 to 100.
 *
 * @param volume Volume of video (Default value of 100)
 */
export function set_volume(volume: number): void {
  enqueue(() => updateVolume(Math.max(0, Math.min(100, volume) / 100.0)));
}

/**
 * Set pix-n-flix to use an uploaded local file
 * as the video or image feed instead of the default camera feed.
 */
export function use_local_file(): void {
  inputFeed = InputFeed.Local;
}

/**
 * Set pix-n-flix to use the image from given URL
 * as the image feed instead of the default camera feed.
 *
 * @param URL URL of image to be loaded
 */
export function use_image_url(URL: string) {
  inputFeed = InputFeed.ImageURL;
  url = URL;
}

/**
 * Set pix-n-flix to use a video resource from given URL
 * as the video feed instead of the default camera feed.
 *
 * @param URL URL of video to be loaded
 */
export function use_video_url(URL: string) {
  inputFeed = InputFeed.VideoURL;
  url = URL;
}
