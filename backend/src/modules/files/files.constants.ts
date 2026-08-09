export const FILE_UPLOAD_MAX_BYTES =
  Number(process.env.FILE_UPLOAD_MAX_BYTES) || 10 * 1024 * 1024;

export const FILE_UPLOAD_MAX_LABEL = `${Math.round(FILE_UPLOAD_MAX_BYTES / (1024 * 1024))} MB`;
