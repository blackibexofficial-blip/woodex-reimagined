import { getStorefrontPageSnapshot, type StorefrontPageSnapshot } from "@/api/storefront-pages";
import { preparePublicDocument } from "./public-document";

/** A published snapshot exists, but its content is outside the provisional profile. */
export class UnsupportedStorefrontDocumentError extends Error {
  constructor() {
    super("This published page is not supported by the storefront renderer.");
    this.name = "UnsupportedStorefrontDocumentError";
  }
}

/**
 * Entry point for a future renderer: fetch the immutable public snapshot, then
 * require and use the validated copy. Missing pages return undefined; backend
 * failures and unsupported content remain distinct errors. The staging route is opt-in.
 */
export async function getRenderableStorefrontPage(slug: string): Promise<StorefrontPageSnapshot | undefined> {
  const snapshot = await getStorefrontPageSnapshot(slug);
  if (!snapshot) return undefined;
  const result = preparePublicDocument(snapshot.doc);
  if (!result.ok) throw new UnsupportedStorefrontDocumentError();
  return { ...snapshot, doc: result.doc };
}
