import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import prisma from '../db/db.config';
import jwt from 'jsonwebtoken';
import { detectDevice, getClientIP, DeviceInfo } from '../utils/device-detector';

export const streamPremiumVideo = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const handleError = (error: Error, message: string) => {
    console.error(message, error);
    res.status(500).json({ error: 'Error processing video request' });
  };

  const servePreviewVideo = (videoPath: string, fileSize: number) => {
    try {
      serveVideo(res, videoPath, req.headers.range, fileSize, true, 20);
    } catch (error) {
      handleError(error as Error, 'Error serving preview:');
    }
  };
  try {
    const { productId } = req.params;
    const authHeader = req.headers.authorization;
    console.log('=== Auth Header Debug ===');
    console.log('Authorization header:', authHeader);
    console.log('All headers:', req.headers);
    
    const token = authHeader?.split(' ')[1];
    console.log('Extracted token:', token ? 'Token present' : 'No token');
    console.log('=== End Auth Header Debug ===');
    
    const PREVIEW_DURATION = 20; // 20 seconds preview for non-authenticated users

    // Get product and its associated course
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { 
        videoLink: true,
        courseId: true 
      }
    });

    if (!product || !product.videoLink) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    // ── Cloudinary / external URL: check enrollment then redirect ──────────
    if (product.videoLink.startsWith('https://') || product.videoLink.startsWith('http://')) {
      if (!token) {
        res.status(403).json({ error: 'Login required to watch this video', preview: true });
        return;
      }
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
        const userId = decoded.userId || decoded.id || decoded.sub;
        const customer = await prisma.customer.findFirst({ where: { userId } });
        if (!customer) {
          res.status(403).json({ error: 'No customer profile found', preview: true });
          return;
        }
        const order = await prisma.orders.findFirst({
          where: { customerId: customer.id, status: 'ACTIVE' },
          include: { course: true },
        });
        const hasPurchased = order && order.course.some((c: any) => c.id === product.courseId);
        if (hasPurchased) {
          res.redirect(product.videoLink);
        } else {
          res.status(403).json({ error: 'Purchase required', preview: true, previewDuration: 20 });
        }
      } catch {
        res.status(403).json({ error: 'Invalid token', preview: true });
      }
      return;
    }

    // ── Local disk streaming ────────────────────────────────────────────────
    const filename = path.basename(product.videoLink);
    const videoPath = path.join(process.cwd(), 'uploads', 'videos', 'products', filename);

    if (!fs.existsSync(videoPath)) {
      res.status(404).json({ error: 'Video file not found' });
      return;
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (!token) {
      console.log('No credentials provided, serving preview');
      servePreviewVideo(videoPath, fileSize);
      return;
    }

    // Verify token and check access
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
      console.log('=== Token Debug ===');
      console.log('Decoded token:', decoded);
      console.log('Token keys:', Object.keys(decoded));
      
      // Handle different token structures
      const userId = decoded.userId || decoded.id || decoded.sub;
      console.log('Extracted User ID:', userId);
      console.log('=== End Token Debug ===');

      // Get the customer ID from the user ID
      const customer = await prisma.customer.findFirst({
        where: {
          userId: userId
        }
      });
      
      console.log('=== Customer Debug ===');
      console.log('Customer found:', customer ? 'Yes' : 'No');
      if (customer) {
        console.log('Customer ID:', customer.id);
      }
      console.log('=== End Customer Debug ===');
      
      if (!customer) {
        console.log('No customer profile found for user, serving preview');
        servePreviewVideo(videoPath, fileSize);
        return;
      }

      // Check if user has purchased the course
      const order = await prisma.orders.findFirst({
        where: {
          customerId: customer.id,
          status: 'ACTIVE'
        },
        include: {
          course: true
        }
      });

      // Debug logging
      console.log('=== Purchase Verification Debug ===');
      console.log('User ID:', userId);
      console.log('Product Course ID:', product.courseId);
      console.log('Order found:', order ? 'Yes' : 'No');
      if (order) {
        console.log('Order courses:', order.course.map(c => ({ id: c.id, name: c.name })));
        console.log('Order course IDs:', order.course.map(c => c.id));
      }

      // Check if the order contains the specific course
      const hasPurchasedCourse = order && order.course.some(course => course.id === product.courseId);
      console.log('Has purchased course:', hasPurchasedCourse);
      console.log('=== End Debug ===');

      if (!hasPurchasedCourse) {
        console.log('User has not purchased this course, serving preview');
        servePreviewVideo(videoPath, fileSize);
        return;
      }

      // User has access, serve full video with analytics
      serveVideoWithAnalytics(res, videoPath, range, fileSize, false, userId, productId, product.courseId, req);
      return;
    } catch (error) {
      console.log('=== JWT Verification Error Debug ===');
      console.error('Error verifying token or checking access:', error);
      console.log('Error type:', typeof error);
      console.log('Error message:', error instanceof Error ? error.message : error);
      console.log('Error name:', error instanceof Error ? error.name : 'N/A');
      console.log('=== End JWT Verification Error Debug ===');
      
      // If token is invalid, serve preview
      servePreviewVideo(videoPath, fileSize);
      return;
    }
  } catch (error) {
    console.error('Error streaming video:', error);
    res.status(500).json({ error: 'Error streaming video' });
  }
};

// Helper function to serve video with proper headers
const serveVideo = (res: Response, videoPath: string, range: string | string[] | undefined, fileSize: number, isPreview: boolean = false, previewDuration: number = 20): void => {
  const sendError = (code: number, message: string) => {
    res.status(code).json({ error: message });
  };

  // Handle case where file doesn't exist
  try {
    if (!fs.existsSync(videoPath)) {
      sendError(404, 'Video file not found');
      return;
    }
  } catch (error) {
    console.error('Error checking file existence:', error);
    sendError(500, 'Error accessing video file');
    return;
  }
  // For preview, we'll limit to 20 seconds of playback
  // We'll use a fixed chunk size that should be enough for 20 seconds
  // This is an approximation - for more precise timing, you'd need to decode the video
  const PREVIEW_DURATION_MS = 20 * 1000; // 20 seconds in milliseconds
  const BYTES_PER_SECOND_ESTIMATE = 1024 * 100; // Adjust this based on your video bitrate
  const previewSize = isPreview 
    ? Math.min(BYTES_PER_SECOND_ESTIMATE * 20, fileSize) 
    : fileSize;
    
  // Always limit the end position if it's a preview
  const endPosition = isPreview ? previewSize - 1 : fileSize - 1;
  
  // Parse Range header if present
  if (range) {
    let start: number;
    let end: number;
    
    try {
      const parts = range.toString().replace(/bytes=/, "").split("-");
      start = parseInt(parts[0], 10);
      
      // For preview, don't allow seeking beyond the preview size
      if (isPreview) {
        if (start >= previewSize) {
          start = 0; // Reset to start if trying to seek beyond preview
        }
        // Always limit to preview size
        end = Math.min(
          parts[1] ? parseInt(parts[1], 10) : start + (1024 * 1024),
          previewSize - 1
        );
      } else {
        // Full video access
        end = parts[1] 
          ? Math.min(parseInt(parts[1], 10), fileSize - 1)
          : Math.min(start + (1024 * 1024), fileSize - 1);
      }
      
      // Validate range
      if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize) {
        const headers = {
          'Content-Range': `bytes */${fileSize}`
        };
        res.writeHead(416, headers);
        res.end();
        return;
      }
      
      // For preview, ensure we don't serve beyond the preview size
      if (isPreview && end > previewSize) {
        const headers = {
          'Content-Range': `bytes */${previewSize}`
        };
        res.writeHead(416, headers);
        res.end();
        return;
      }
      
      const chunkSize = (end - start) + 1;

      try {
        const file = fs.createReadStream(videoPath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${isPreview ? previewSize : fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': 'video/mp4',
          'X-Content-Duration': isPreview ? previewDuration.toString() : 'full',
          'X-Content-Length': fileSize.toString(),
          'X-Content-Type': isPreview ? 'preview' : 'full',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        };

        res.writeHead(206, head);
        file.pipe(res);
      } catch (streamError) {
        console.error('Error creating read stream:', streamError);
        res.status(500).json({ error: 'Error streaming video' });
      }
    } catch (error) {
      console.error('Error processing range request:', error);
      res.status(500).json({ error: 'Error processing video stream' });
    }
  } else {
    // No range requested, serve the beginning of the file (for preview or start of video)
    const end = isPreview ? previewSize - 1 : fileSize - 1;
    const contentLength = end + 1; // +1 because end is 0-based
    
    const head = {
      'Content-Length': contentLength,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Content-Range': `bytes 0-${end}/${isPreview ? previewSize : fileSize}`,
      'X-Content-Duration': isPreview ? '20' : 'full', // Always 20 seconds for preview
      'X-Content-Length': fileSize.toString(),
      'X-Content-Type': isPreview ? 'preview' : 'full',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Time-Limit': isPreview ? '20' : 'unlimited' // Additional header to indicate time limit
    };

    res.writeHead(200, head);
    
    // Create a read stream with the correct end position
    const readStream = fs.createReadStream(videoPath, { 
      start: 0, 
      end: end 
    });
    
    // Handle any errors with the read stream
    readStream.on('error', (error) => {
      console.error('Error reading video file:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error reading video file' });
      }
    });
    
    // Pipe the video to the response
    readStream.pipe(res);
  }
};

// Enhanced video serving function with analytics collection
const serveVideoWithAnalytics = (
  res: Response, 
  videoPath: string, 
  range: string | string[] | undefined, 
  fileSize: number, 
  isPreview: boolean = false,
  userId: string,
  productId: string,
  courseId: string,
  req: Request
): void => {
  const sendError = (code: number, message: string) => {
    res.status(code).json({ error: message });
  };

  // Collect device information
  const userAgent = req.headers['user-agent'] || '';
  const deviceInfo: DeviceInfo = detectDevice(userAgent);
  const clientIP = getClientIP(req);
  
  // Track watch start time
  const watchStartTime = Date.now();
  let watchDuration = 0;
  
  // Handle response end to calculate watch duration
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    watchDuration = Math.floor((Date.now() - watchStartTime) / 1000); // Convert to seconds
    
    // Save analytics data asynchronously
    saveVideoAnalytics({
      userId,
      productId,
      courseId,
      deviceInfo,
      watchDuration,
      totalTime: isPreview ? 20 : 300, // Estimate total time (20s for preview, 5min for full video)
      clientIP,
      userAgent
    }).catch(error => {
      console.error('Error saving video analytics:', error);
    });
    
    // Call original end method
    return originalEnd.call(this, chunk, encoding);
  };

  // Handle connection close
  res.on('close', () => {
    if (watchDuration === 0) {
      watchDuration = Math.floor((Date.now() - watchStartTime) / 1000);
      
      // Save analytics data for incomplete views
      saveVideoAnalytics({
        userId,
        productId,
        courseId,
        deviceInfo,
        watchDuration,
        totalTime: isPreview ? 20 : 300,
        clientIP,
        userAgent
      }).catch(error => {
        console.error('Error saving video analytics on close:', error);
      });
    }
  });

  // Call the original serveVideo function
  serveVideo(res, videoPath, range, fileSize, isPreview, isPreview ? 20 : undefined);
};

// Function to save video analytics to database
const saveVideoAnalytics = async (data: {
  userId: string;
  productId: string;
  courseId: string;
  deviceInfo: DeviceInfo;
  watchDuration: number;
  totalTime: number;
  clientIP: string;
  userAgent: string;
}) => {
  try {
    const completionRate = data.totalTime > 0 ? (data.watchDuration / data.totalTime) * 100 : 0;
    
    await prisma.videoAnalytics.create({
      data: {
        userId: data.userId,
        productId: data.productId,
        courseId: data.courseId,
        deviceType: data.deviceInfo.deviceType,
        operatingSystem: data.deviceInfo.operatingSystem,
        browser: data.deviceInfo.browser,
        watchDuration: data.watchDuration,
        totalTime: data.totalTime,
        completionRate: completionRate,
        ipAddress: data.clientIP,
        userAgent: data.userAgent
      }
    });
    
    console.log(`Video analytics saved for user ${data.userId}, product ${data.productId}, duration: ${data.watchDuration}s`);
  } catch (error) {
    console.error('Error saving video analytics:', error);
    throw error;
  }
};

export const getPremiumVideoInfo = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { productId } = req.params;
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { 
        id: true,
        name: true,
        videoLink: true,
        courseId: true,
        course: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!product || !product.videoLink) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    const filename = path.basename(product.videoLink);
    const videoPath = path.join(process.cwd(), 'uploads', 'videos', 'products', filename);

    if (!fs.existsSync(videoPath)) {
      res.status(404).json({ error: 'Video file not found' });
      return;
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const hasAccess = await checkVideoAccess(token, product.courseId);

    res.status(200).json({
      id: product.id,
      name: product.name,
      hasAccess,
      duration: hasAccess ? 'full' : 'preview',
      previewDuration: 20, // seconds
      size: fileSize,
      mimeType: 'video/mp4',
      course: product.course
    });
  } catch (error) {
    console.error('Error getting video info:', error);
    res.status(500).json({ error: 'Error getting video info' });
  }
};

// Helper function to check if user has access to the video
const checkVideoAccess = async (token: string | undefined, courseId: string): Promise<boolean> => {
  if (!token) return false;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as { userId: string };
    
    const order = await prisma.orders.findFirst({
      where: {
        customerId: decoded.userId,
        course: {
          some: {
            id: courseId
          }
        },
        status: 'ACTIVE'
      }
    });

    return !!order;
  } catch (error) {
    return false;
  }
};
