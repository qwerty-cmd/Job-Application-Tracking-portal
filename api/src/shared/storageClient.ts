// ============================================================================
// Azure Blob Storage Singleton Client
// ============================================================================
// Reuse a single BlobServiceClient instance across all function invocations.
// Validates env vars on first use (fails fast with clear error).

import {
  BlobServiceClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";

let blobServiceClient: BlobServiceClient | null = null;
let storageCredential: StorageSharedKeyCredential | null = null;

export function getStorageCredential(): StorageSharedKeyCredential {
  if (!storageCredential) {
    const accountName = process.env.STORAGE_ACCOUNT_NAME;
    const accountKey = process.env.STORAGE_ACCOUNT_KEY;
    if (!accountName || !accountKey) {
      throw new Error(
        "STORAGE_ACCOUNT_NAME and STORAGE_ACCOUNT_KEY environment variables are required",
      );
    }
    storageCredential = new StorageSharedKeyCredential(accountName, accountKey);
  }
  return storageCredential;
}

export function getStorageAccountName(): string {
  const accountName = process.env.STORAGE_ACCOUNT_NAME;
  if (!accountName) {
    throw new Error("STORAGE_ACCOUNT_NAME environment variable is required");
  }
  return accountName;
}

export function getBlobServiceClient(): BlobServiceClient {
  if (!blobServiceClient) {
    const accountName = getStorageAccountName();
    const credential = getStorageCredential();
    blobServiceClient = new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      credential,
    );
  }
  return blobServiceClient;
}
