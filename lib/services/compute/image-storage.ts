/**
 * R2 staging for custom-image snapshots. A server's disk is exported to qcow2
 * and uploaded here (by the Proxmox host, via a presigned PUT), so any host in
 * any region can later pull it (presigned GET) and build a local template —
 * which is what makes a snapshot usable across all regions.
 *
 * Bucket: `R2_CUSTOM_IMAGES_BUCKET` (default "ahura-custom-images"). Key layout:
 *   <owner_id>/<image_id>.qcow2
 */
import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const CUSTOM_IMAGES_BUCKET = process.env.R2_CUSTOM_IMAGES_BUCKET || "ahura-custom-images";

function getS3(): S3Client {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT;
  if (!accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error("R2 credentials missing — set R2_ACCESS_KEY_ID/SECRET/ENDPOINT");
  }
  return new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } });
}

export function snapshotKey(ownerId: string, imageId: string): string {
  return `${ownerId}/${imageId}.qcow2`;
}

/** Presigned PUT URL the Proxmox host uses to upload the exported disk. */
export async function presignSnapshotUpload(key: string, expiresIn = 6 * 3600): Promise<string> {
  const s3 = getS3();
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: CUSTOM_IMAGES_BUCKET, Key: key }), { expiresIn });
}

/** Presigned GET URL a host uses to pull the staged disk at build time. */
export async function presignSnapshotDownload(key: string, expiresIn = 6 * 3600): Promise<string> {
  const s3 = getS3();
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: CUSTOM_IMAGES_BUCKET, Key: key }), { expiresIn });
}

export async function deleteSnapshotObject(key: string): Promise<void> {
  const s3 = getS3();
  await s3.send(new DeleteObjectCommand({ Bucket: CUSTOM_IMAGES_BUCKET, Key: key }));
}
