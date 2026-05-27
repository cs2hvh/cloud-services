/**
 * R2 helpers for the batch endpoint — uploads + downloads of JSONL input,
 * output, and error files. Shared between the files API, the batches API,
 * and the batch processor.
 *
 * Bucket: ahura-batches  (separate from ahura-ft-adapters so quotas and
 * lifecycle policies can be tuned independently). Key layout:
 *
 *   <org_id>/<file_id>.jsonl
 *
 * org_id prefix makes deletion-on-org-cascade trivial (single rclone
 * delete of <org_id>/), and matches the prefix-lock pattern used for
 * FT adapter URLs.
 */
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const BATCH_BUCKET = "ahura-batches";

function getS3(): S3Client {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT;
  if (!accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error("R2 credentials missing — set R2_ACCESS_KEY_ID/SECRET/ENDPOINT");
  }
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export function fileKey(orgId: string, fileId: string): string {
  return `${orgId}/${fileId}.jsonl`;
}

export async function uploadBytes(orgId: string, fileId: string, body: Buffer | Uint8Array, contentType = "application/x-ndjson"): Promise<void> {
  const s3 = getS3();
  await s3.send(
    new PutObjectCommand({
      Bucket: BATCH_BUCKET,
      Key: fileKey(orgId, fileId),
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function downloadText(orgId: string, fileId: string): Promise<string> {
  const s3 = getS3();
  const r = await s3.send(
    new GetObjectCommand({ Bucket: BATCH_BUCKET, Key: fileKey(orgId, fileId) })
  );
  // SDK v3: r.Body is a stream; transformToString does the right thing in Node 20+.
  // @ts-expect-error — runtime method present on Node streams
  return await r.Body.transformToString();
}

export async function deleteObject(orgId: string, fileId: string): Promise<void> {
  const s3 = getS3();
  await s3.send(
    new DeleteObjectCommand({ Bucket: BATCH_BUCKET, Key: fileKey(orgId, fileId) })
  );
}

const DOWNLOAD_URL_TTL_SECONDS = 6 * 3600;

export async function presignDownload(orgId: string, fileId: string): Promise<string> {
  const s3 = getS3();
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BATCH_BUCKET, Key: fileKey(orgId, fileId) }),
    { expiresIn: DOWNLOAD_URL_TTL_SECONDS }
  );
}
