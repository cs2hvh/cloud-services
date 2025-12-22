import { createSSRClient } from "../server";

//All storage of files in s3 bucket and recieve the url to store in database
export const storeFile = async (clusterId: string, file: File) => {
  const path = `clusters/${clusterId}/${Date.now()}-${file.name}`;
  const supabase = await createSSRClient();
  const { error: uploadError } = await supabase.storage
    .from("kubeconfigs") // bucket name
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) throw uploadError;

  return { path };
};
