import { respondWithJSON } from "./json";

import { type ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, UserForbiddenError } from "./errors";
import { getBearerToken, validateJWT } from "../auth";
import { getVideo, updateVideo } from "../db/videos";
import path from "node:path";
import { rm } from "fs/promises";

const VIDEO_BYTE_LIMIT = 1 << 30;

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }
  const token = getBearerToken(req.headers);
  const userId = validateJWT(token, cfg.jwtSecret);

  const videoDB = getVideo(cfg.db, videoId);

  if (videoDB?.userID !== userId) {
    throw new UserForbiddenError("Video does not belong to user");
  }

  const formData = await req.formData();
  const video = formData.get("video");

  if (!(video instanceof File)) {
    throw new BadRequestError("Not an instance of File");
  }
  if (video.size > VIDEO_BYTE_LIMIT) {
    throw new BadRequestError("File is too large");
  }

  if (video.type !== "video/mp4") {
    throw new BadRequestError("File is not a video");
  }
  const videoName = `${videoId}.mp4`
  const uniquePath = path.join(cfg.assetsRoot, videoName)

  try{
    await Bun.write(uniquePath, video);
    const metaData = cfg.s3Client.file(`${videoId}.mp4`);
    await metaData.write(await Bun.file(uniquePath).arrayBuffer(), {type: video.type});

    videoDB.videoURL = `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${videoName}`;
    updateVideo(cfg.db, videoDB);
  } finally {
    await rm(uniquePath, {force: true});
  }
  return respondWithJSON(200, videoDB);
}
