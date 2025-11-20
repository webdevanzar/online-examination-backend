// import multer from "multer";
// import { AppError } from "../utils/ErrorHandler";

// const MAX_SIZE = 50 * 1024 * 1024; // 50MB

// // Factory to create multer with custom allowed file types
// export const Upload = (allowedTypes: string[]) => {
//   const fileFilter = (
//     _req: any,
//     file: Express.Multer.File,
//     cb: multer.FileFilterCallback
//   ) => {
//     if (allowedTypes.includes(file.mimetype)) {
//       cb(null, true);
//     } else {
//       cb(
//         new AppError(
//           `Only files of types: ${allowedTypes.join(", ")} are allowed`,
//           400
//         )
//       );
//     }
//   };

//   const storage = multer.memoryStorage();

//   return multer({
//     storage,
//     limits: { 
//       fileSize: MAX_SIZE, // ← CORRECT: For file size limit only
//     },
//     fileFilter,
//   });
// };

// export const imageUpload = Upload([
//   "image/jpeg",
//   "image/jpg",
//   "image/png",
//   "image/svg+xml",
// ]);

// export const excelUpload = Upload([
//   "text/csv",
//   "application/vnd.ms-excel",
//   "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
// ]);

// export const attachmentUpload = Upload([
//   // Images
//   "image/jpeg",
//   "image/jpg",
//   "image/png",
//   "image/svg+xml",
//   "image/gif",
//   "image/webp",
//   // Videos
//   "video/mp4",
//   "video/mkv",
//   "video/mpeg",
//   "video/quicktime",
//   "video/x-msvideo",
//   "video/webm",
//   // Audio
//   "audio/webm",
//   "audio/mpeg",
//   "audio/mp3",
//   "audio/wav",
//   "audio/ogg",
//   "audio/aac",
//   "audio/mp4",
//   // Documents
//   "application/pdf",
//   "application/msword",
//   "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
//   "application/vnd.ms-excel",
//   "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
//   "application/vnd.ms-powerpoint",
//   "application/vnd.openxmlformats-officedocument.presentationml.presentation",
//   "text/plain",
// ]);

import multer from "multer";
import { AppError } from "../utils/ErrorHandler";

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

const ALLOWED_MEDIA_TYPES = [
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  // Videos
  "video/mp4",
  "video/mpeg",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/mkv",
];

export const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MEDIA_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError("Only image or video files are allowed", 400));
    }
  },
});
