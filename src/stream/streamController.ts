import { NextFunction, Request, Response } from "express";
import { getSignedHlsUrl } from "../services/signedUrl";

export const streamChunkVideo = async (req: Request, res: Response, next: NextFunction) => {
  const decoded = decodeURIComponent(req.params.key);

  // Cloudinary or other external URLs are returned directly without signing
  if (decoded.startsWith('https://') || decoded.startsWith('http://')) {
    return res.json({ url: decoded });
  }

  const signedUrl = await getSignedHlsUrl(decoded);
  res.json({ url: signedUrl });
};
