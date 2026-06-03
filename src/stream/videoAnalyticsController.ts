import { NextFunction, Request, Response } from "express";
import prisma from "../db/db.config";
import * as UAParser from "ua-parser-js";
import { AuthRequest } from "../types";

export const updateVideoAnalytics = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      productId,
      courseId,
      watchDuration,
      totalTime,
    } = req.body;

    // Check if user email exists in the token
    if (!req.user?.email) {
      res.status(401).json({
        status: 0,
        message: 'Authentication required: No email found in token'
      });
      return;
    }

    const userId = req.user.email; // from auth middleware
    const user = await prisma.user.findUnique({
      where: { email: userId },
      include: {
        customer: true
      }
    });

    if (!user?.id) {
      return res.status(401).json({
        status: 0,
        message: "Unauthorized",
      });
    }

    if (!productId || !courseId || !watchDuration || !totalTime) {
      return res.status(400).json({
        status: 0,
        message: "Missing required fields",
      });
    }

    // ---------------------------
    // 1️⃣ Parse User Agent
    // ---------------------------
    const userAgent = req.headers["user-agent"] || "";
    const parser = new UAParser.UAParser(userAgent);

    const deviceType =
      parser.getDevice().type || "desktop";

    const operatingSystem =
      parser.getOS().name || "Unknown";

    const browser =
      parser.getBrowser().name || "Unknown";

    // ---------------------------
    // 2️⃣ Calculate Completion %
    // ---------------------------
    const completionRate =
      totalTime > 0
        ? (Number(watchDuration) / Number(totalTime)) * 100
        : 0;

    // ---------------------------
    // 3️⃣ Get IP Address
    // ---------------------------
    const ipAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      req.socket.remoteAddress ||
      null;

    // ---------------------------
    // 4️⃣ Create Analytics Entry
    // ---------------------------
    // const analytics = await prisma.videoAnalytics.create({
    //   data: {
    //     userId: user.id,
    //     productId,
    //     courseId,
    //     deviceType,
    //     operatingSystem,
    //     browser,
    //     watchDuration: Number(watchDuration),
    //     totalTime: Number(totalTime),
    //     completionRate,
    //     ipAddress,
    //     userAgent,
    //   },
    // });
    const analytics = await prisma.videoAnalytics.upsert({
        where: {
            userId_productId: {
            userId: user.id,
            productId,
            },
        },
        update: {
            watchDuration: Number(watchDuration),
            totalTime: Number(totalTime),
            completionRate,
            deviceType,
            operatingSystem,
            browser,
            ipAddress,
            userAgent,
        },
        create: {
            userId: user.id,
            productId,
            courseId,
            deviceType,
            operatingSystem,
            browser,
            watchDuration: Number(watchDuration),
            totalTime: Number(totalTime),
            completionRate,
            ipAddress,
            userAgent,
        },
        });


    return res.status(200).json({
      status: 1,
      message: "Analytics updated",
      data: analytics,
    });

  } catch (error) {
    console.error("Analytics Error:", error);
    return res.status(500).json({
      status: 0,
      message: "Internal server error",
    });
  }
};
