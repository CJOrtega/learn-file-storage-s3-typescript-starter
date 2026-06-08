import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import path from "node:path";
import { mediaTypeToExt } from "./assets";

type Thumbnail = {
  data: ArrayBuffer;
  mediaType: string;
};

const MAX_UPLOAD_SIZE = 10 << 20;

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const formData = await req.formData();
  const file = formData.get("thumbnail");

  if (!(file instanceof File)) {
    throw new BadRequestError("Not an instance of File");
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("File size is too large");
  }

  const mediaType = file.type;
  const buffer = await file.arrayBuffer();

  const videoDB = getVideo(cfg.db, videoId);

  if (!videoDB) {
    throw new BadRequestError("Could not find video");
  }

  if (videoDB.userID != userID) {
    throw new UserForbiddenError("User does not have access to this video");
  }
  const filename = `${videoId}.${mediaTypeToExt(mediaType)}`
  const uniquePath = path.join(cfg.assetsRoot, filename);

  await Bun.write(uniquePath, buffer);
  videoDB.thumbnailURL = `http://localhost:${cfg.port}/assets/${filename}`;
  updateVideo(cfg.db, videoDB);
  return respondWithJSON(200, videoDB);
}
