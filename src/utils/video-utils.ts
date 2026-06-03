import fs from 'fs';
import path from 'path';
import ffprobe from 'ffprobe-static';
import { promisify } from 'util';

const execAsync = promisify(require('child_process').exec);

/**
 * Get the duration of a video file using ffprobe
 * @param videoPath Path to the video file
 * @returns Duration in seconds
 */
export const getVideoDuration = async (videoPath: string): Promise<number> => {
  try {
    // Check if file exists
    if (!fs.existsSync(videoPath)) {
      console.warn(`Video file not found: ${videoPath}`);
      return 0;
    }

    // Use ffprobe to get video duration
    const { stdout } = await execAsync(`"${ffprobe.path}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`);
    
    const duration = parseFloat(stdout.trim());
    return isNaN(duration) ? 0 : Math.floor(duration);
  } catch (error) {
    console.error('Error getting video duration:', error);
    return 0;
  }
};

/**
 * Get video duration from a URL by extracting the filename and checking local storage
 * @param videoUrl URL of the video (e.g., http://localhost:8000/uploads/videos/products/filename.mp4)
 * @returns Duration in seconds
 */
export const getVideoDurationFromUrl = async (videoUrl: string): Promise<number> => {
  try {
    let videoPath: string;

    if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
      // Absolute URL — extract path portion and resolve to local file
      const urlObj = new URL(videoUrl);
      const relativePath = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;
      videoPath = path.join(process.cwd(), relativePath);
    } else {
      // Relative path like /uploads/videos/filename.mp4
      const relativePath = videoUrl.startsWith('/') ? videoUrl.slice(1) : videoUrl;
      videoPath = path.join(process.cwd(), relativePath);
    }

    return await getVideoDuration(videoPath);
  } catch (error) {
    console.error('Error getting video duration from URL:', error);
    return 0;
  }
};

/**
 * Format seconds into a human-readable time format (HH:MM:SS)
 * @param seconds Duration in seconds
 * @returns Formatted time string
 */
export const formatDuration = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '00:00:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    remainingSeconds.toString().padStart(2, '0')
  ].join(':');
};

/**
 * Get total duration of multiple videos
 * @param videoUrls Array of video URLs
 * @returns Total duration in seconds
 */
export const getTotalVideoDuration = async (videoUrls: string[]): Promise<number> => {
  try {
    const durations = await Promise.all(
      videoUrls.map(url => getVideoDurationFromUrl(url))
    );
    
    return durations.reduce((total, duration) => total + duration, 0);
  } catch (error) {
    console.error('Error getting total video duration:', error);
    return 0;
  }
};
