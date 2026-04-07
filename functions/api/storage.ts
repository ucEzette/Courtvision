import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

// CRITICAL: Polyfill DOM/Node APIs for Cloudflare Workers
// The AWS SDK v3 S3 client requires DOMParser, XMLSerializer, and Node constants 
// to parse XML responses from R2 correctly.
(globalThis as any).DOMParser = DOMParser;
(globalThis as any).XMLSerializer = XMLSerializer;
(globalThis as any).Node = {
    ELEMENT_NODE: 1,
    ATTRIBUTE_NODE: 2,
    TEXT_NODE: 3,
    CDATA_SECTION_NODE: 4,
    ENTITY_REFERENCE_NODE: 5,
    ENTITY_NODE: 6,
    PROCESSING_INSTRUCTION_NODE: 7,
    COMMENT_NODE: 8,
    DOCUMENT_NODE: 9,
    DOCUMENT_TYPE_NODE: 10,
    DOCUMENT_FRAGMENT_NODE: 11,
    NOTATION_NODE: 12
};

interface Env {
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_ENDPOINT: string;
  BUCKET_NAME: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  // 0. Robust Environment Validation
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_ENDPOINT || !env.BUCKET_NAME) {
    return new Response(JSON.stringify({ 
      error: "R2 Environment Configuration Missing. Please set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, and BUCKET_NAME in Cloudflare Pages settings." 
    }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const s3 = new S3Client({
      region: "auto",
      endpoint: env.R2_ENDPOINT,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });

    // GET: Generate Streaming URL
    if (request.method === "GET") {
      const key = url.searchParams.get("key");
      if (!key) return new Response("Missing key", { status: 400 });

      const command = new GetObjectCommand({
        Bucket: env.BUCKET_NAME,
        Key: key,
      });

      const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
      return new Response(JSON.stringify({ url: signedUrl }), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" 
        },
      });
    }

    // DELETE: Remove Object from R2
    if (request.method === "DELETE") {
      const key = url.searchParams.get("key");
      if (!key) return new Response("Missing key", { status: 400 });

      const command = new DeleteObjectCommand({
        Bucket: env.BUCKET_NAME,
        Key: key,
      });

      await s3.send(command).catch(e => { throw new Error(`R2 Delete Failed: ${e.message}`) });
      return new Response(JSON.stringify({ success: true }), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" 
        },
      });
    }

    // POST: Multipart & Standard Upload Orchestration
    if (request.method === "POST") {
      const body = await request.json<any>();
      const { action, fileName, contentType } = body;

      const key = body.key || `${Date.now()}-${fileName || 'upload'}`;

      if (action === "upload") {
        // Standard Single-part Upload
        const command = new PutObjectCommand({
          Bucket: env.BUCKET_NAME,
          Key: key,
          ContentType: contentType || "video/mp4",
        });
        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        return new Response(JSON.stringify({ key, url: signedUrl }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" 
          },
        });
      }

      if (action === "multipart-init") {
        const command = new CreateMultipartUploadCommand({
          Bucket: env.BUCKET_NAME,
          Key: key,
          ContentType: contentType || "video/mp4",
        });

        // Use standard s3.send now that DOMParser is polyfilled
        const multipart = await s3.send(command).catch(e => { throw new Error(`R2 Init Failed: ${e.message}`) });
        
        return new Response(JSON.stringify({ key, uploadId: multipart.UploadId }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" 
          },
        });
      }

      if (action === "multipart-part") {
        const { uploadId, partNumber } = body;
        const command = new UploadPartCommand({
          Bucket: env.BUCKET_NAME,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
        });
        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        return new Response(JSON.stringify({ url: signedUrl }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" 
          },
        });
      }

      if (action === "multipart-complete") {
        const { uploadId, parts } = body;
        const command = new CompleteMultipartUploadCommand({
          Bucket: env.BUCKET_NAME,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts },
        });

        // Use standard s3.send now that DOMParser is polyfilled
        await s3.send(command).catch(e => { 
           throw new Error(`R2 Complete Failed: ${e.message}`);
        });

        return new Response(JSON.stringify({ success: true, key }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" 
          },
        });
      }

      return new Response("Invalid action", { status: 400 });
    }

    // Add OPTIONS handle for preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        }
      });
    }

    return new Response("Method not allowed", { status: 405 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" 
      } 
    });
  }
};
