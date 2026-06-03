import { Request, Response, NextFunction } from 'express';
import { Prisma, ActiveStatus } from '@prisma/client';
import prisma from '../db/db.config';
import { blogListQuerySchema, blogIdParamSchema } from '../schemas/blog.schema';

export const getBlogs = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    // Validate query parameters
    const queryParams = blogListQuerySchema.safeParse(req.query);
    
    if (!queryParams.success) {
      res.status(400).json({
        status: 0,
        message: 'Invalid query parameters',
        errors: queryParams.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      });
      return;
    }
    
    const { page = '1', limit = '10', status, categoryId, featured, category } = queryParams.data;
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.BlogWhereInput = {
      status: ActiveStatus.ACTIVE // Only show active blogs by default
    };
    
    if (status) {
      where.status = status;
    }
    
    if (categoryId) {
      where.categoryId = categoryId;
    }
    
    if (featured !== undefined) {
      where.featured = featured;
    }
    
    if (category) {
      where.OR = [
        { categoryId: category as string }
      ];
    }

    const [blogs, total] = await Promise.all([
      prisma.blog.findMany({
        where,
        include: {
          category: {
            select: {
              id: true,
              name: true
            }
          },
          author: {
            select: {
              id: true,
              name: true,
              imageLink: true,
            }
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limitNum,
      }),
      prisma.blog.count({ where })
    ]);

    // Format the response to include category and IDs
    const formattedBlogs = blogs.map(blog => ({
      ...blog,
      categoryId: blog.categoryId,
      category: blog.category ? {
        id: blog.category.id,
        name: blog.category.name
      } : null,
      author: blog.author ? {
        id: blog.author.id,
        name: blog.author.name,
        imageLink: blog.author.imageLink
      } : null,
    }));

    res.status(200).json({
      status: 1,
      data: formattedBlogs,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum
      }
    });
  } catch (error) {
    console.error('Error fetching blogs:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to fetch blogs',
      error: 'Internal server error'
    });
  }
};

export const getBlogById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { id } = req.params;

    // Validate ID parameter
    const idValidation = blogIdParamSchema.safeParse({ id });
    
    if (!idValidation.success) {
      res.status(400).json({
        status: 0,
        message: 'Invalid blog ID',
        errors: idValidation.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      });
      return;
    }
    
    const blog = await prisma.blog.findUnique({
      where: { id },
      include: {
        category: {
          select: {
            id: true,
            name: true
          }
        },
        author: {
          select: {
            id: true,
            name: true,
            imageLink: true,
          }
        },
      },
    });

    if (!blog) {
      res.status(404).json({
        status: 0,
        message: 'Blog not found'
      });
      return;
    }

    // Format the response to include category and IDs
    const formattedBlog = {
      ...blog,
      categoryId: blog.categoryId,
      category: blog.category ? {
        id: blog.category.id,
        name: blog.category.name
      } : null,
      author: blog.author ? {
        id: blog.author.id,
        name: blog.author.name,
        imageLink: blog.author.imageLink
      } : null,
    };

    res.status(200).json({
      status: 1,
      data: formattedBlog,
    });
  } catch (error) {
    console.error('Error fetching blog:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to fetch blog',
      error: 'Internal server error',
    });
  }
};