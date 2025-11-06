import axios from "axios";
import { createDOClient } from "../axios";


export async function createSpacesKey(
  name: string,
  grants: Array<{ bucket: string; permission: string }>
) {
  console.log("Creating Spaces key with name:", name, "and grants:", grants);
  try {
    const doClient = createDOClient();
    const response = await doClient.client.post("/v2/spaces/keys", {
      name: name,
      grants: grants,
    });

    console.log("DO API Response:", JSON.stringify(response.data, null, 2));

    // Extract credentials from response - try multiple possible paths
    const accessKey = 
      response.data.key?.access_key;
      
    const secretKey = 
      response?.data?.key?.secret_key;
      
    const keyName = 
      response?.data?.key?.name;

    console.log("Extracted - Access Key:", accessKey ? "Present" : "MISSING");
    console.log("Extracted - Secret Key:", secretKey ? "Present" : "MISSING");

    return {
      success: true,
      data: {
        access_key: accessKey,
        secret_key: secretKey,
        name: keyName,
      },
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.message || error.message;
      console.error("[DigitalOcean] Error creating Spaces key:", message);
      return {
        success: false,
        error: message,
      };
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[DigitalOcean] Error creating Spaces key:", errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Delete a Spaces access key
 * @param accessKeyId The access key ID to delete
 */
export async function deleteSpacesKey(accessKeyId: string) {
  try {
    const doClient = createDOClient();
    await doClient.client.delete(`/v2/spaces/keys/${accessKeyId}`);
    return { success: true };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.message || error.message;
      console.error("[DigitalOcean] Error deleting Spaces key:", message);
      return {
        success: false,
        error: message,
      };
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[DigitalOcean] Error deleting Spaces key:", errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * List all Spaces access keys
 */
export async function listSpacesKeys() {
  try {
    const doClient = createDOClient();
    const response = await doClient.client.get("/v2/spaces/keys");
    return {
      success: true,
      data: response.data.spaces_access_keys || [],
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.message || error.message;
      console.error("[DigitalOcean] Error listing Spaces keys:", message);
      return {
        success: false,
        error: message,
      };
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[DigitalOcean] Error listing Spaces keys:", errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
