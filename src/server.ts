import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import { loginUser, refreshTokens, logoutUser, registerUser, googleLogin } from './accounts/auth.controller';
import { updatePassword } from './accounts/auth.controller';
import { getCustomerData, updateCustomerData } from './accounts/accounts.controller';
import { getCustomerAnalysis, getCustomerDetails } from './adminpanel/customeranalysis.controller';
import { authMiddleware } from './accounts/auth.middleware';
import { AuthRequest } from './types';
import { 
  createCategory, 
  listCategories,
  getCategoryById,
  deleteCategory,
  updateCategory
} from './adminpanel/admin.controller';
import { 
  createAddress, 
  updateAddress, 
  deleteAddress,
  listAddresses
} from './accounts/address.controller';
import { 
  createCourse, 
  updateCourse, 
  deleteCourse
} from './adminpanel/course.controller';
import {
  listCourses,
  getCourseDetails,
  getCourseCustomers
} from './course/course.controller';
import { createReview } from './course/review.controller';
import { createCourseFAQ, listCourseFAQs, getCourseFAQById, getCourseFAQByCourseId } from './adminpanel/courseFaq.controller';
import { 
  createGeneralFAQ, 
  listGeneralFAQs, 
  getGeneralFAQById, 
  updateGeneralFAQ, 
  deleteGeneralFAQ 
} from './adminpanel/generalFaq.controller';
import { 
  createFeatureGallery,
  listFeatureGalleries,
  getFeatureGalleryById,
  updateFeatureGallery,
  deleteFeatureGallery
} from './adminpanel/featureGallery.controller';
import { 
  createFeatureBrand,
  listFeatureBrands,
  getFeatureBrandById,
  updateFeatureBrand,
  deleteFeatureBrand
} from './adminpanel/featureBrand.controller';
import { createDiscountCoupon, deleteDiscountCoupon, listDiscountCoupons, updateDiscountCoupon } from './adminpanel/discount.controller';
import { uploadProductVideo, deleteProductVideo, getProductDetails } from './course/product.controller';
import { createOrder, getUserOrders, getOrderDetails, checkCourseOrdered, getAllOrdersForAdmin } from './order/order.controller';
import { streamVideo, getVideoInfo } from './stream/stream.controller';
import { streamPremiumVideo, getPremiumVideoInfo } from './stream/premium-video.controller';
import { 
  getVideoAnalyticsByCourse,
  getVideoAnalyticsByUser,
  getOverallVideoAnalytics,
  getVideoAnalyticsByProduct,
  getCustomerWatchHistory,
  getCustomerCourseProgress,
  getCustomerCourseAnalytics
} from './analytics/video-analytics.controller';
import { createProduct, reorderProducts } from './adminpanel/product.controller';
import { 
  getBlogs, 
  getBlogById 
} from './blog/blog.controller';
import { getUserNavData } from './navbarMenu/nav.controller';

import { 
  createBlog, 
  updateBlog, 
  deleteBlog 
} from './adminpanel/blog.controller';
import { clearDatabase, checkClearDatabase } from './adminpanel/clearDatabase.controller';
import { getRevenueReport, getMonthlyRevenue } from './adminpanel/revenue.controller';
import { 
  getBanners,
  getBannerById,
  createBanner,
  updateBanner,
  deleteBanner
} from './banner/banner.controller';
import { uploadBannerImage, isAdmin as isBannerAdmin } from './banner/upload.middleware';
import {
  getTestimonials,
  getTestimonialById,
  createTestimonial,
  updateTestimonial,
  deleteTestimonial
} from './testimonials/testimonial.controller';
import { uploadTestimonialImage, isAdmin as isTestimonialAdmin } from './testimonials/upload.middleware';
import { 
  getWishlist, 
  addToWishlist, 
  removeFromWishlist, 
  checkInWishlist 
} from './wishlist/wishlist.controller';
import {
  uploadVideo,
  uploadCourseImage,
  uploadCourseFiles,
  uploadBlogImage,
  uploadCategoryFiles,
  uploadFeatureBrandImage,
  uploadFeatureGalleryImage,
  uploadAuthorImage,
  uploadCreatorImage,
  uploadSuccessStoryFiles,
  uploadEventImage,
  uploadMarketplaceImages,
} from './middleware/upload.middleware';
import { createAuthor, deleteAuthor, getAuthorById, getAuthors, updateAuthor } from './adminpanel/author.controller';
import { createCreator, deleteCreator, getCreatorById, getCreators, updateCreator } from './adminpanel/creator.controller';
import { createSuccessStory, deleteSuccessStory, getSuccessStoryById, listSuccessStory } from './adminpanel/success.controller';
import { listCustomers, listAdmins, listStaff, getCustomerOverview } from './adminpanel/user.controller';
import { listEvents, getEventById, registerForEvent, checkEventRegistered, getMyRegistrations } from './events/event.controller';
import { createEvent, updateEvent, deleteEvent, listEventsAdmin } from './adminpanel/event.controller';
import { listBanners, createBanner as createBannerAdmin, updateBanner as updateBannerAdmin, deleteBanner as deleteBannerAdmin } from './adminpanel/banner.controller';
import { getReferralSettings, updateReferralSettings, getMyReferralData, updateUpiId, requestPayout, getPayoutRequests, updatePayoutRequest } from './referral/referral.controller';
import { createMarketplaceProduct, listMarketplaceProducts, getMarketplaceProduct, updateMarketplaceProduct, deleteMarketplaceProduct } from './adminpanel/marketplace.controller';

dotenv.config();
const app = express();
const PORT: number = parseInt(process.env.PORT || '4000');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const isProduction = process.env.NODE_ENV === 'production';

// Serve static files from uploads/ when using local storage (DO credentials not configured)
const useLocalStorage = !process.env.CF_R2_ACCESS_KEY;
import fs from 'fs';
import { getDashboardStats } from './adminpanel/dashboard.controller';
import { addToCart, deleteCart, listCart, checkInCart } from './cart/cart.controller';
import { 
  createStaffAccess, 
  updateStaffAccess, 
  deleteStaffAccess, 
  listStaffAccess, 
  getStaffAccessById, 
  deleteAllStaffAccess
} from './adminpanel/staffAccess.controller';
import { 
  createStaffRole, 
  updateStaffRole, 
  deleteStaffRole, 
  listStaffRoles, 
  getStaffRoleById 
} from './adminpanel/staffRole.controller';
import { updateVideoAnalytics } from './stream/videoAnalyticsController';
import { streamChunkVideo } from './stream/streamController';
import { getUploadUrl, confirmUpload, startHlsConversion, serveHlsManifest } from './adminpanel/videoUpload.controller';

const uploadsPath = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
app.use('/uploads', express.static(uploadsPath));

// R2 image proxy — serves any R2 object through the API so no public bucket URL is needed
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { spacesClient } from './config/spaces';
app.get('/r2/*', async (req: Request, res: Response) => {
  const key = (req.params as any)[0] as string;
  if (!key) { res.status(400).send('Missing key'); return; }
  try {
    const cmd = new GetObjectCommand({ Bucket: process.env.CF_R2_BUCKET!, Key: key });
    const obj = await spacesClient.send(cmd);
    res.setHeader('Content-Type', obj.ContentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const chunks: Buffer[] = [];
    for await (const chunk of obj.Body as any) chunks.push(Buffer.from(chunk));
    res.send(Buffer.concat(chunks));
  } catch {
    res.status(404).send('Not found');
  }
});

// For development, explicitly allow the frontend origin
// const allowedOrigins = isProduction
//   ? ['https://skillocraft-front.onrender.com']
//   : ['http://localhost:3000', 'http://127.0.0.1:3000'];
const allowedOrigins = isProduction
  ? (process.env.FRONT_END_URL || '').split(',').map(s => s.trim()).filter(Boolean)
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

// CORS configuration
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed origins
    if (allowedOrigins.indexOf(origin) !== -1 || !isProduction) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Access-Control-Allow-Credentials',
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Headers',
    'X-CSRFToken',
    'x-csrf-token',
    'xsrf-token'
  ],
  exposedHeaders: ['set-cookie', 'x-csrf-token', 'xsrf-token'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Add headers before the routes are defined
app.use(function (req, res, next) {
  // Website you wish to allow to connect
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  // Request methods you wish to allow
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  // Request headers you wish to allow
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization');
  // Set to true if you need the website to include cookies in the requests sent
  // to the API (e.g. in case you use sessions)
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  // Pass to next layer of middleware
  next();
});


// Log CORS configuration for debugging
console.log(`CORS Configuration: ${isProduction ? 'Production' : 'Development'} mode`);
console.log('Allowed Headers:', corsOptions.allowedHeaders);
// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message 
  });
});
// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Dashboard Routes
app.get('/dashboard/stats', 
  authMiddleware, 
  (req: Request, res: Response) => {
    getDashboardStats(req, res);
  }
);

// Registration Routes with Role-Specific Endpoints
app.post('/accounts/register/customer', (req: Request, res: Response, next: NextFunction) => {
  // Explicitly set role to CUSTOMER
  req.body.role = 'CUSTOMER';
  registerUser(req, res, next);
});

app.post('/accounts/register/staff', (req: Request, res: Response, next: NextFunction) => {
  // Explicitly set role to STAFF
  req.body.role = 'STAFF';
  registerUser(req, res, next);
});

app.post('/accounts/register/admin', (req: Request, res: Response, next: NextFunction) => {
  // Explicitly set role to ADMIN
  req.body.role = 'ADMIN';
  registerUser(req, res, next);
});

// Token Refresh Route
app.post('/accounts/refresh-token', (req: Request, res: Response, next: NextFunction) => {
  refreshTokens(req, res, next);
});

// Logout Route
app.post('/accounts/logout', authMiddleware, (req: AuthRequest, res: Response, next: NextFunction) => {
  logoutUser(req, res, next);
});

app.post('/accounts/login', (req: Request, res: Response, next: NextFunction) => {
  loginUser(req, res, next);
});

// Address Routes
app.post('/accounts/address', authMiddleware, (req: AuthRequest, res: Response, next: NextFunction) => {
  createAddress(req, res, next);
});

app.put('/accounts/address/:addressId', authMiddleware, (req: AuthRequest, res: Response, next: NextFunction) => {
  updateAddress(req, res, next);
});

app.delete('/accounts/address/:addressId', authMiddleware, (req: AuthRequest, res: Response, next: NextFunction) => {
  deleteAddress(req, res, next);
});

app.get('/accounts/addresses', authMiddleware, (req: AuthRequest, res: Response, next: NextFunction) => {
  listAddresses(req, res, next);
});

// Get authenticated customer's profile data
app.get('/accounts/customer', authMiddleware, (req: AuthRequest, res: Response, next: NextFunction) => {
  getCustomerData(req, res, next);
});

// Update customer profile data
app.put('/accounts/customer', authMiddleware, (req: AuthRequest, res: Response, next: NextFunction) => {
  updateCustomerData(req, res, next);
});

// Admin Panel Routes (Protected - Only STAFF and ADMIN)

//category Routes (Private - Requires Authentication)
app.post('/adminpanel/category', 
  authMiddleware,
  uploadCategoryFiles,
  (req: Request, res: Response, next: NextFunction) => {
    createCategory(req, res, next);
  },
);

// Update category route
app.put<{ id: string }>('/adminpanel/category/:id', 
  authMiddleware,
  uploadCategoryFiles,
  (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    updateCategory(req as AuthRequest & { 
      params: { id: string };
      files?: { 
        image?: Express.Multer.File[];
        icon?: Express.Multer.File[];
      };
    }, res, next);
  },
);

app.delete('/category/:categoryId', 
  authMiddleware, 
  (req: Request, res: Response, next: NextFunction) => {
    deleteCategory(req as AuthRequest, res, next);
  }
);

app.get('/categories', (req: Request, res: Response, next: NextFunction) => {
  listCategories(req, res, next);
});

app.get('/categories/:id', (req: Request, res: Response, next: NextFunction) => {
  getCategoryById(req, res, next);
});

//success Routes (Private - Requires Authentication)
app.post('/adminpanel/success',
  authMiddleware,
  uploadSuccessStoryFiles, 
  // First handle file upload
  (req: Request, res: Response, next: NextFunction) => {
    createSuccessStory(req, res, next);
  },
);

app.get('/success', (req: Request, res: Response, next: NextFunction) => {
  listSuccessStory(req, res, next);
});

app.get('/success/:successId', (req: Request, res: Response, next: NextFunction) => {
  getSuccessStoryById(req, res, next);
});

app.delete('/success/:successId', 
  authMiddleware, 
  (req: Request, res: Response, next: NextFunction) => {
    deleteSuccessStory(req, res, next);
  }
);

//courses Routes (Private - Requires Authentication)
app.post('/adminpanel/course',
  authMiddleware,
  uploadCourseFiles, 
  // First handle file upload
  (req: Request, res: Response, next: NextFunction) => {
    createCourse(req, res, next);
  },
);

app.get('/courses', (req: Request, res: Response, next: NextFunction) => {
  listCourses(req, res, next);
});

app.get('/courses/:courseId', (req: Request, res: Response, next: NextFunction) => {
  getCourseDetails(req, res, next);
});

app.get('/courses/:courseId/customers', (req: Request, res: Response, next: NextFunction) => {
  getCourseCustomers(req, res, next);
});

// Course FAQ Routes
app.post('/adminpanel/course-faqs', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    createCourseFAQ(req as AuthRequest, res, next);
  }
);

app.get('/course-faqs', (req: Request, res: Response, next: NextFunction) => {
  listCourseFAQs(req, res, next);
});

app.get('/course-faqs/:id', (req: Request, res: Response, next: NextFunction) => {
  getCourseFAQById(req, res, next);
});

app.get('/course-all-faqs/:id', (req: Request, res: Response, next: NextFunction) => {
  getCourseFAQByCourseId(req, res, next);
});

// General FAQ Routes
app.post('/adminpanel/general-faqs', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    createGeneralFAQ(req as AuthRequest, res, next);
  }
);

app.put('/adminpanel/general-faqs/:id',
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    updateGeneralFAQ(req as AuthRequest, res, next);
  }
);

app.delete('/adminpanel/general-faqs/:id',
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    deleteGeneralFAQ(req as AuthRequest, res, next);
  }
);

app.get('/general-faqs', (req: Request, res: Response, next: NextFunction) => {
  listGeneralFAQs(req, res, next);
});

app.get('/general-faqs/:id', (req: Request, res: Response, next: NextFunction) => {
  getGeneralFAQById(req, res, next);
});

// Feature Gallery Routes
app.post('/api/feature-gallery', 
  authMiddleware, 
  uploadFeatureGalleryImage, 
  createFeatureGallery
);

app.get('/adminpanel/feature-gallery', listFeatureGalleries);
app.get('/feature-gallery/:id', getFeatureGalleryById);

app.put('/adminpanel/feature-gallery/:id', 
  authMiddleware, 
  uploadFeatureGalleryImage, 
  updateFeatureGallery
);

app.delete('adminpanel/feature-gallery/:id', 
  authMiddleware, 
  deleteFeatureGallery
);

// Feature Brand Routes
app.post('/adminpanel/feature-brands', 
  authMiddleware, 
  uploadFeatureBrandImage, 
  createFeatureBrand
);

app.get('/feature-brands', listFeatureBrands);
app.get('/feature-brands/:id', getFeatureBrandById);

app.put('/adminpanel/feature-brands/:id', 
  authMiddleware, 
  uploadFeatureBrandImage, 
  updateFeatureBrand
);

app.delete('/adminpanel/feature-brands/:id', 
  authMiddleware, 
  deleteFeatureBrand
);

app.post('/adminpanel/feature-gallery', 
  authMiddleware,
  uploadFeatureGalleryImage,
  (req: Request, res: Response, next: NextFunction) => {
    createFeatureGallery(req as AuthRequest, res, next);
  }
);

app.put('/adminpanel/feature-gallery/:id',
  authMiddleware,
  uploadFeatureGalleryImage,
  (req: Request, res: Response, next: NextFunction) => {
    updateFeatureGallery(req as AuthRequest, res, next);
  }
);

app.delete('/adminpanel/feature-gallery/:id',
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    deleteFeatureGallery(req as AuthRequest, res, next);
  }
);

app.get('/feature-gallery', (req: Request, res: Response, next: NextFunction) => {
  listFeatureGalleries(req, res, next);
});

app.get('/feature-gallery/:id', (req: Request, res: Response, next: NextFunction) => {
  getFeatureGalleryById(req, res, next);
});

// Create Review Route (Admin Only - Requires Authentication)
app.post('/adminpanel/reviews', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  createReview(req as AuthRequest, res, next);
});

app.get('/course/product/:productId', (req: Request, res: Response, next: NextFunction) => {
  getProductDetails(req, res, next);
});

app.put('/adminpanel/courses/:courseId',
  authMiddleware,
  uploadCourseFiles,
  (req: Request, res: Response, next: NextFunction) => {
    updateCourse(req, res, next);
  }
);

app.delete('/adminpanel/courses/:courseId', 
  authMiddleware, 
  (req: Request, res: Response, next: NextFunction) => {
    deleteCourse(req as AuthRequest, res, next);
  }
);

// Reorder lessons within a course
app.patch('/adminpanel/products/reorder',
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    reorderProducts(req as AuthRequest, res, next);
  }
);

// products Routes (Private - Requires Authentication)
app.post('/adminpanel/products',
  authMiddleware,
  uploadVideo,
  // Handle product creation
  (req: Request, res: Response, next: NextFunction) => {
    createProduct(req, res, next);
  }
);

app.post('/adminpanel/products/:productId/upload-video', 
  authMiddleware, 
  uploadVideo,
  (req: Request, res: Response, next: NextFunction) => {
    // Use the typed upload middleware
    uploadProductVideo(req, res, next);
  }
);

app.delete('/products/:productId/video', 
  authMiddleware, 
  (req: Request, res: Response, next: NextFunction) => {
  deleteProductVideo(req, res, next);
});

//blogs Routes (Public)
app.get('/blogs', (req: Request, res: Response, next: NextFunction) => {
  getBlogs(req, res, next);
});

app.get('/blogs/:id', (req: Request, res: Response, next: NextFunction) => {
  getBlogById(req, res, next);
});

app.post('/adminpanel/blogs', 
  authMiddleware,
  uploadBlogImage,
  (req: Request, res: Response, next: NextFunction) => {
    createBlog(req, res, next);
  }
);

app.put('/adminpanel/blogs/:id', 
  authMiddleware,
  uploadBlogImage,
  (req: Request, res: Response, next: NextFunction) => {
    updateBlog(req, res, next);
  }
);

app.delete('/adminpanel/blogs/:id', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    deleteBlog(req as AuthRequest, res, next);
  }
);

//author Routes (Public)
app.get('/author', (req: Request, res: Response, next: NextFunction) => {
  getAuthors(req, res, next);
});

app.get('/author/:id', (req: Request, res: Response, next: NextFunction) => {
  getAuthorById(req, res, next);
});

app.post('/adminpanel/author', 
  authMiddleware,
  uploadAuthorImage,
  (req: Request, res: Response, next: NextFunction) => {
    createAuthor(req,res,next);
  }
);

app.put('/adminpanel/author/:id', 
  authMiddleware,
  uploadAuthorImage,
  (req: Request, res: Response, next: NextFunction) => {
    updateAuthor(req as AuthRequest, res, next);
  }
);

app.delete('/adminpanel/author/:id', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    deleteAuthor(req as AuthRequest, res, next);
  }
);

//creator Routes (Public)
app.get('/creators', (req: Request, res: Response, next: NextFunction) => {
  getCreators(req, res, next);
});

app.get('/creators/:id', (req: Request, res: Response, next: NextFunction) => {
  getCreatorById(req, res, next);
});

app.post('/adminpanel/creator', 
  authMiddleware,
  uploadCreatorImage,
  (req: Request, res: Response, next: NextFunction) => {
    createCreator(req,res,next);
  }
);

app.put('/adminpanel/creator/:id', 
  authMiddleware,
  uploadCreatorImage,
  (req: Request, res: Response, next: NextFunction) => {
    updateCreator(req , res, next);
  }
);

app.delete('/adminpanel/creator/:id', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    deleteCreator(req, res, next);
  }
);

// users (customers) Routes (Private - Admin Only)
app.get('/adminpanel/customers', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    listCustomers(req as AuthRequest, res, next);
  }
);

// admins Routes (Private - Admin Only)
app.get('/adminpanel/admins',
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    listAdmins(req as AuthRequest, res, next);
  }
);

// staff Routes (Private - Admin Only)
app.get('/adminpanel/staff',
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    listStaff(req as AuthRequest, res, next);
  }
);

// customer overview (details + orders + wishlist + cart) - Admin Only
app.get('/adminpanel/customers/:customerId',
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    getCustomerOverview(req as AuthRequest, res, next);
  }
);

// orders Routes (Private - Requires Authentication)
app.post('/orders', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  createOrder(req as AuthRequest, res, next);
});

app.get('/orders/check/:courseId', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  checkCourseOrdered(req as AuthRequest, res, next);
});

app.get('/orders', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  getUserOrders(req as AuthRequest, res, next);
});

app.get('/orders/:orderId', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  getOrderDetails(req as AuthRequest, res, next);
});

// Admin Orders Route (Admin Only - Requires Authentication)
app.get('/adminpanel/orders', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  getAllOrdersForAdmin(req as AuthRequest, res, next);
});

// Admin Revenue Report Route (Admin Only - Requires Authentication)
app.get('/adminpanel/revenue', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  getRevenueReport(req as AuthRequest, res, next);
});

// Monthly revenue by year (for admin dashboard chart)
app.get('/adminpanel/monthly-revenue', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  getMonthlyRevenue(req as AuthRequest, res, next);
});

// Public video streaming (unlimited access)
app.get('/stream/video/:productId/info', (req: Request, res: Response, next: NextFunction) => {
  getVideoInfo(req, res, next);
});

app.get('/stream/video/:productId', (req: Request, res: Response, next: NextFunction) => {
  streamVideo(req, res, next);
});

// Premium video streaming with access control
app.get('/premium/video/:productId/info', (req: Request, res: Response, next: NextFunction) => {
  getPremiumVideoInfo(req, res, next);
});

app.get('/premium/video/:productId', (req: Request, res: Response, next: NextFunction) => {
  streamPremiumVideo(req, res, next);
});

app.get("/stream/:key", authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  streamChunkVideo(req, res, next);
});

// HLS manifest — token in query string, no authMiddleware needed
app.get("/stream/hls/:productId", (req: Request, res: Response, next: NextFunction) => {
  serveHlsManifest(req as AuthRequest, res, next);
});

// Direct R2 upload — presigned PUT URL
app.post("/adminpanel/upload-url", authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  getUploadUrl(req as AuthRequest, res, next);
});

// Confirm upload done
app.post("/adminpanel/upload-complete/:productId", authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  confirmUpload(req as AuthRequest, res, next);
});

// Trigger HLS conversion
app.post("/adminpanel/products/:productId/start-hls", authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  startHlsConversion(req as AuthRequest, res, next);
});
app.post("/analytics",authMiddleware, (req: Request, res: Response, next: NextFunction) => { 
  updateVideoAnalytics(req as AuthRequest, res, next); 
});

// Video Analytics Routes
// Get video analytics by course ID (Admin only)
app.get('/adminpanel/video-analytics/course/:courseId', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  getVideoAnalyticsByCourse(req, res, next);
});

// Get video analytics by user ID (Admin only)
app.get('/adminpanel/video-analytics/user/:userId', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  getVideoAnalyticsByUser(req as AuthRequest, res, next);
});

// Get video analytics by product ID (Admin only)
app.get('/adminpanel/video-analytics/product/:productId', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  getVideoAnalyticsByProduct(req, res, next);
});

// Get overall video analytics (Admin only)
app.get('/adminpanel/video-analytics', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  getOverallVideoAnalytics(req as AuthRequest, res, next);
});

// Customer Video Analytics Routes
// Get customer's watch history
app.get('/customer/video-analytics/watch-history', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  getCustomerWatchHistory(req as AuthRequest, res, next);
});

// Get customer's course progress
app.get('/customer/video-analytics/course-progress/:courseId', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  getCustomerCourseProgress(req as AuthRequest, res, next);
});

// Get comprehensive course analytics with purchase verification
app.get('/customer/video-analytics/course/:courseId', (req: Request, res: Response, next: NextFunction) => {
  getCustomerCourseAnalytics(req, res, next);
});

// discount Routes (Private - Requires Authentication)
app.put('/adminpanel/discount-coupon/:discountId', authMiddleware, (req: AuthRequest, res: Response, next: NextFunction) => {
  updateDiscountCoupon(req, res, next);
});

app.post('/adminpanel/discount-coupon', authMiddleware, (req: AuthRequest, res: Response, next: NextFunction) => {
  createDiscountCoupon(req, res, next);
});

app.delete('/adminpanel/discount-coupon/:discountId', authMiddleware, (req: AuthRequest, res: Response, next: NextFunction) => {
  deleteDiscountCoupon(req, res, next);
});

app.get('/adminpanel/discount-coupons', (req: Request, res: Response, next: NextFunction) => {
  listDiscountCoupons(req, res, next);
});

// Database Management Routes (Development only)
app.get('/api/admin/check-clear-database', 
  authMiddleware, 
  (req: Request, res: Response) => {
    checkClearDatabase(req, res);
  }
);

// Customer Analysis Routes (Admin only)
app.get('/adminpanel/customer-analysis', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    getCustomerAnalysis(req, res, next);
  }
);

app.get('/adminpanel/customers/:customerId', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    getCustomerDetails(req, res, next);
  }
);

// Update user password
app.put('/accounts/update-password', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    updatePassword(req as AuthRequest, res, next);
  }
);

app.get('/cart', 
  authMiddleware, 
  (req: Request, res: Response, next: NextFunction) => {
    listCart(req as AuthRequest, res, next);
  }
);

app.post('/cart', 
  authMiddleware, 
  (req: Request, res: Response, next: NextFunction) => {
    addToCart(req as AuthRequest, res, next);
  }
);

app.get('/cart/check/:courseId',
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    checkInCart(req as AuthRequest, res, next);
  }
);

app.delete('/cart/:cartId', 
  authMiddleware, 
  (req: Request, res: Response, next: NextFunction) => {
    deleteCart(req as AuthRequest, res, next);
  }
);

app.post('/api/admin/clear-database', 
  authMiddleware, 
  (req: Request, res: Response) => {
    clearDatabase(req, res);
  }
);

// Banner Routes
app.get('/banners', (req: Request, res: Response, next: NextFunction) => {
  listBanners(req, res, next);
});

app.get('/banners/:id', (req: Request, res: Response, next: NextFunction) => {
  getBannerById(req, res, next);
});

app.post('/banners', 
  authMiddleware, 
  isBannerAdmin,
  uploadBannerImage,
  (req: Request, res: Response, next: NextFunction) => {
    createBanner(req as AuthRequest, res, next);
  }
);

app.put('/banners/:id', 
  authMiddleware, 
  isBannerAdmin,
  uploadBannerImage,
  (req: Request, res: Response, next: NextFunction) => {
    updateBanner(req as AuthRequest, res, next);
  }
);

app.delete('/banners/:id', 
  authMiddleware, 
  isBannerAdmin,
  (req: Request, res: Response, next: NextFunction) => {
    deleteBanner(req as AuthRequest, res, next);
  }
);

// Testimonials Routes (Private - Requires Authentication)
app.get('/testimonials', (req: Request, res: Response, next: NextFunction) => {
  getTestimonials(req, res, next);
});

app.get('/testimonials/:id', (req: Request, res: Response, next: NextFunction) => {
  getTestimonialById(req, res, next);
});

app.post('/testimonials', 
  authMiddleware, 
  isTestimonialAdmin,
  uploadTestimonialImage,
  (req: Request, res: Response, next: NextFunction) => {
    createTestimonial(req as AuthRequest, res, next);
  }
);

app.put('/testimonials/:id', 
  authMiddleware, 
  isTestimonialAdmin,
  uploadTestimonialImage,
  (req: Request, res: Response, next: NextFunction) => {
    updateTestimonial(req as AuthRequest, res, next);
  }
);

app.delete('/testimonials/:id', 
  authMiddleware, 
  isTestimonialAdmin,
  (req: Request, res: Response, next: NextFunction) => {
    deleteTestimonial(req as AuthRequest, res, next);
  }
);

// Wishlist Routes (Private - Requires Authentication)
app.get('/wishlist', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    getWishlist(req as AuthRequest, res, next);
  }
);

app.post('/wishlist/:courseId', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    addToWishlist(req as AuthRequest, res, next);
  }
);

app.delete('/wishlist/:courseId', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    removeFromWishlist(req as AuthRequest, res, next);
  }
);

app.get('/wishlist/check/:courseId', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    checkInWishlist(req as AuthRequest, res, next);
  }
);

// Navbar data route - returns cart count and notification count
app.get('/navbar/data', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    getUserNavData(req as AuthRequest, res, next);
  }
);

// Staff Access Routes
app.post('/staff-access', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    createStaffAccess(req as AuthRequest, res, next);
  }
);

app.put('/staff-access/:id', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    updateStaffAccess(req as AuthRequest, res, next);
  }
);

app.delete('/staff-access/:id', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    deleteStaffAccess(req as AuthRequest, res, next);
  }
);

app.delete('/staff-access/', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    deleteAllStaffAccess(req as AuthRequest, res, next);
  }
);

app.get('/staff-access', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    listStaffAccess(req, res, next);
  }
);

app.get('/staff-access/:id', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    getStaffAccessById(req, res, next);
  }
);

// Staff Role Routes
app.post('/staff-roles', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    createStaffRole(req as AuthRequest, res, next);
  }
);

app.put('/staff-roles/:id', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    updateStaffRole(req as AuthRequest, res, next);
  }
);

app.delete('/staff-roles/:id', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    deleteStaffRole(req as AuthRequest, res, next);
  }
);

app.get('/staff-roles', 
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    listStaffRoles(req, res, next);
  }
);

app.get('/staff-roles/:id',
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    getStaffRoleById(req, res, next);
  }
);

// Events Routes
app.get('/events', (req: Request, res: Response, next: NextFunction) => {
  listEvents(req, res, next);
});

app.get('/events/:eventId', (req: Request, res: Response, next: NextFunction) => {
  getEventById(req, res, next);
});

app.post('/events/:eventId/register', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  registerForEvent(req as AuthRequest, res, next);
});

app.get('/events/:eventId/check-registered', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  checkEventRegistered(req as AuthRequest, res, next);
});

// Admin Events Routes
app.get('/adminpanel/events', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  listEventsAdmin(req as AuthRequest, res, next);
});

app.post('/adminpanel/events', authMiddleware, uploadEventImage, (req: Request, res: Response, next: NextFunction) => {
  createEvent(req as AuthRequest, res, next);
});

app.put('/adminpanel/events/:eventId', authMiddleware, uploadEventImage, (req: Request, res: Response, next: NextFunction) => {
  updateEvent(req as AuthRequest, res, next);
});

app.delete('/adminpanel/events/:eventId', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  deleteEvent(req as AuthRequest, res, next);
});

// Event registrations for current user
app.get('/events/my-registrations', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  getMyRegistrations(req as AuthRequest, res, next);
});

// Banner routes (adminpanel)
app.post('/adminpanel/banners', authMiddleware, uploadBannerImage, (req: Request, res: Response, next: NextFunction) => {
  createBanner(req as AuthRequest, res, next);
});
app.put('/adminpanel/banners/:bannerId', authMiddleware, uploadBannerImage, (req: Request, res: Response, next: NextFunction) => {
  updateBanner(req as AuthRequest, res, next);
});
app.delete('/adminpanel/banners/:bannerId', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  deleteBannerAdmin(req as AuthRequest, res, next);
});

// Google OAuth login
app.post('/accounts/google-login', (req: Request, res: Response, next: NextFunction) => {
  googleLogin(req, res, next);
});

// Referral Routes
app.get('/referral/settings', (req: Request, res: Response, next: NextFunction) => {
  getReferralSettings(req, res, next);
});

app.put('/adminpanel/referral-settings', authMiddleware, (req: AuthRequest, res: Response, next: NextFunction) => {
  updateReferralSettings(req, res, next);
});

app.get('/referral/my-data', authMiddleware, (req: AuthRequest, res: Response, next: NextFunction) => {
  getMyReferralData(req, res, next);
});

app.patch('/referral/upi-id', authMiddleware, (req: AuthRequest, res: Response, next: NextFunction) => {
  updateUpiId(req, res, next);
});

app.post('/referral/payout-request', authMiddleware, (req: AuthRequest, res: Response, next: NextFunction) => {
  requestPayout(req, res, next);
});

app.get('/adminpanel/payout-requests', authMiddleware, (req: AuthRequest, res: Response, next: NextFunction) => {
  getPayoutRequests(req, res, next);
});

app.patch('/adminpanel/payout-requests/:id', authMiddleware, (req: AuthRequest, res: Response, next: NextFunction) => {
  updatePayoutRequest(req, res, next);
});

// Marketplace Routes
app.get('/marketplace-products', (req: Request, res: Response, next: NextFunction) => {
  listMarketplaceProducts(req, res, next);
});
app.get('/marketplace-products/:id', (req: Request, res: Response, next: NextFunction) => {
  getMarketplaceProduct(req, res, next);
});
app.post('/adminpanel/marketplace-products', authMiddleware, uploadMarketplaceImages, (req: Request, res: Response, next: NextFunction) => {
  createMarketplaceProduct(req as AuthRequest, res, next);
});
app.put('/adminpanel/marketplace-products/:id', authMiddleware, uploadMarketplaceImages, (req: Request, res: Response, next: NextFunction) => {
  updateMarketplaceProduct(req as AuthRequest, res, next);
});
app.delete('/adminpanel/marketplace-products/:id', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  deleteMarketplaceProduct(req as AuthRequest, res, next);
});