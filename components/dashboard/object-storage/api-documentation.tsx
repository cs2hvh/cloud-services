"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Copy, Check, FileUp, Download, Trash2, List, Code2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const ApiDocumentation = () => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyCode = (code: string, label: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(label);
    toast.success("Code copied to clipboard");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const CodeBlock = ({ code, label }: { code: string; label: string }) => (
    <div className="relative group">
      <pre className="bg-black/50 border border-white/10 rounded-lg p-4 overflow-x-auto text-sm">
        <code className="text-white/80 font-mono">{code}</code>
      </pre>
      <button
        onClick={() => copyCode(code, label)}
        className="absolute top-2 right-2 p-2 bg-white/5 hover:bg-white/10 rounded transition-all opacity-0 group-hover:opacity-100"
      >
        {copiedCode === label ? (
          <Check className="h-4 w-4 text-green-400" />
        ) : (
          <Copy className="h-4 w-4 text-white/60" />
        )}
      </button>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="border border-white/10 rounded-lg p-6 bg-white/5">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-500/20 rounded-lg">
            <Code2 className="h-6 w-6 text-blue-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold mb-2">Object Storage API Documentation</h2>
            <p className="text-white/60">
              Use these APIs to programmatically manage files in your buckets. All endpoints require authentication
              and proper bucket ownership verification.
            </p>
          </div>
        </div>
      </div>

      {/* API Tabs */}
      <Tabs defaultValue="upload" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 bg-white/5 border border-white/10">
          <TabsTrigger value="upload" className="data-[state=active]:bg-white/10">
            <FileUp className="h-4 w-4 mr-2" />
            Upload
          </TabsTrigger>
          <TabsTrigger value="list" className="data-[state=active]:bg-white/10">
            <List className="h-4 w-4 mr-2" />
            List
          </TabsTrigger>
          <TabsTrigger value="download" className="data-[state=active]:bg-white/10">
            <Download className="h-4 w-4 mr-2" />
            Download
          </TabsTrigger>
          <TabsTrigger value="delete" className="data-[state=active]:bg-white/10">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </TabsTrigger>
        </TabsList>

        {/* Upload File */}
        <TabsContent value="upload" className="space-y-6">
          <div className="border border-white/10 rounded-lg p-6 bg-white/5 space-y-4">
            <div>
              <h3 className="text-xl font-semibold mb-2">Upload File</h3>
              <p className="text-white/60 text-sm">
                Upload a file to your bucket. Supports multipart form data.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs font-semibold rounded">POST</span>
                <code className="text-sm text-white/80">/api/services/object-storage/buckets/files/upload</code>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2 text-white/80">Request Body (multipart/form-data)</h4>
              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <code className="text-blue-400">bucket_id</code>
                  <span className="text-white/40">•</span>
                  <span className="text-white/60">string (required) - Your bucket ID</span>
                </div>
                <div className="flex gap-2">
                  <code className="text-blue-400">file</code>
                  <span className="text-white/40">•</span>
                  <span className="text-white/60">File (required) - The file to upload</span>
                </div>
                <div className="flex gap-2">
                  <code className="text-blue-400">folder_path</code>
                  <span className="text-white/40">•</span>
                  <span className="text-white/60">string (optional) - Folder path (e.g., "images/avatars/")</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3 text-white/80">Example - JavaScript/Fetch</h4>
              <CodeBlock
                label="upload-js"
                code={`const formData = new FormData();
formData.append('bucket_id', 'your-bucket-id');
formData.append('file', fileInput.files[0]);
formData.append('folder_path', 'images/'); // optional

const response = await fetch('/api/services/object-storage/buckets/files/upload', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log(result);
// { success: true, message: "File uploaded", key: "images/file.jpg" }`}
              />
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3 text-white/80">Example - cURL</h4>
              <CodeBlock
                label="upload-curl"
                code={`curl -X POST https://your-domain.com/api/services/object-storage/buckets/files/upload \\
  -F "bucket_id=your-bucket-id" \\
  -F "file=@/path/to/your/file.jpg" \\
  -F "folder_path=images/" \\
  -H "Authorization: Bearer YOUR_TOKEN"`}
              />
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded p-4">
              <p className="text-sm text-blue-300">
                <strong>💡 Tip:</strong> The folder_path parameter helps organize files. If omitted, files are uploaded to the root of the bucket.
              </p>
            </div>
          </div>
        </TabsContent>

        {/* List Files */}
        <TabsContent value="list" className="space-y-6">
          <div className="border border-white/10 rounded-lg p-6 bg-white/5 space-y-4">
            <div>
              <h3 className="text-xl font-semibold mb-2">List Files</h3>
              <p className="text-white/60 text-sm">
                List all files in your bucket with optional filtering and pagination.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs font-semibold rounded">POST</span>
                <code className="text-sm text-white/80">/api/services/object-storage/buckets/files/list</code>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2 text-white/80">Request Body (JSON)</h4>
              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <code className="text-blue-400">bucket_id</code>
                  <span className="text-white/40">•</span>
                  <span className="text-white/60">string (required) - Your bucket ID</span>
                </div>
                <div className="flex gap-2">
                  <code className="text-blue-400">prefix</code>
                  <span className="text-white/40">•</span>
                  <span className="text-white/60">string (optional) - Filter by prefix/folder</span>
                </div>
                <div className="flex gap-2">
                  <code className="text-blue-400">max_keys</code>
                  <span className="text-white/40">•</span>
                  <span className="text-white/60">number (optional, default: 1000) - Max results</span>
                </div>
                <div className="flex gap-2">
                  <code className="text-blue-400">use_folders</code>
                  <span className="text-white/40">•</span>
                  <span className="text-white/60">boolean (optional, default: false) - Group by folders</span>
                </div>
                <div className="flex gap-2">
                  <code className="text-blue-400">continuation_token</code>
                  <span className="text-white/40">•</span>
                  <span className="text-white/60">string (optional) - For pagination</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3 text-white/80">Example - JavaScript/Fetch</h4>
              <CodeBlock
                label="list-js"
                code={`const response = await fetch('/api/services/object-storage/buckets/files/list', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    bucket_id: 'your-bucket-id',
    prefix: 'images/',        // optional: filter by folder
    max_keys: 100,            // optional: limit results
    use_folders: false        // optional: get all files (not grouped)
  })
});

const result = await response.json();
console.log(result);
// {
//   success: true,
//   files: [
//     { Key: "images/photo1.jpg", Size: 102400, LastModified: "2024-01-01T00:00:00Z" },
//     { Key: "images/photo2.jpg", Size: 204800, LastModified: "2024-01-02T00:00:00Z" }
//   ],
//   is_truncated: false,
//   next_continuation_token: null
// }`}
              />
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3 text-white/80">Example - cURL</h4>
              <CodeBlock
                label="list-curl"
                code={`curl -X POST https://your-domain.com/api/services/object-storage/buckets/files/list \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -d '{
    "bucket_id": "your-bucket-id",
    "prefix": "images/",
    "max_keys": 100,
    "use_folders": false
  }'`}
              />
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-4">
              <p className="text-sm text-yellow-300">
                <strong>⚠️ Note:</strong> Set use_folders to false to get all files in a flat list. Set to true to group files by folders.
              </p>
            </div>
          </div>
        </TabsContent>

        {/* Download File */}
        <TabsContent value="download" className="space-y-6">
          <div className="border border-white/10 rounded-lg p-6 bg-white/5 space-y-4">
            <div>
              <h3 className="text-xl font-semibold mb-2">Download File</h3>
              <p className="text-white/60 text-sm">
                Download a specific file from your bucket. Returns the file as a binary stream.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs font-semibold rounded">POST</span>
                <code className="text-sm text-white/80">/api/services/object-storage/buckets/files/download</code>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2 text-white/80">Request Body (JSON)</h4>
              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <code className="text-blue-400">bucket_id</code>
                  <span className="text-white/40">•</span>
                  <span className="text-white/60">string (required) - Your bucket ID</span>
                </div>
                <div className="flex gap-2">
                  <code className="text-blue-400">file_key</code>
                  <span className="text-white/40">•</span>
                  <span className="text-white/60">string (required) - The file path/key (e.g., "images/photo.jpg")</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3 text-white/80">Example - JavaScript/Fetch</h4>
              <CodeBlock
                label="download-js"
                code={`const response = await fetch('/api/services/object-storage/buckets/files/download', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    bucket_id: 'your-bucket-id',
    file_key: 'images/photo.jpg'
  })
});

// Get file as blob
const blob = await response.blob();
const url = window.URL.createObjectURL(blob);

// Trigger download
const a = document.createElement('a');
a.href = url;
a.download = 'photo.jpg';
a.click();
window.URL.revokeObjectURL(url);`}
              />
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3 text-white/80">Example - cURL (Save to file)</h4>
              <CodeBlock
                label="download-curl"
                code={`curl -X POST https://your-domain.com/api/services/object-storage/buckets/files/download \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -d '{
    "bucket_id": "your-bucket-id",
    "file_key": "images/photo.jpg"
  }' \\
  --output photo.jpg`}
              />
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded p-4">
              <p className="text-sm text-blue-300">
                <strong>💡 Tip:</strong> The file_key should include the full path if the file is in a folder (e.g., "folder/subfolder/file.jpg").
              </p>
            </div>
          </div>
        </TabsContent>

        {/* Delete File */}
        <TabsContent value="delete" className="space-y-6">
          <div className="border border-white/10 rounded-lg p-6 bg-white/5 space-y-4">
            <div>
              <h3 className="text-xl font-semibold mb-2">Delete File</h3>
              <p className="text-white/60 text-sm">
                Permanently delete a file from your bucket. This action cannot be undone.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs font-semibold rounded">POST</span>
                <code className="text-sm text-white/80">/api/services/object-storage/buckets/files/delete</code>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2 text-white/80">Request Body (JSON)</h4>
              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <code className="text-blue-400">bucket_id</code>
                  <span className="text-white/40">•</span>
                  <span className="text-white/60">string (required) - Your bucket ID</span>
                </div>
                <div className="flex gap-2">
                  <code className="text-blue-400">file_key</code>
                  <span className="text-white/40">•</span>
                  <span className="text-white/60">string (required) - The file path/key to delete</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3 text-white/80">Example - JavaScript/Fetch</h4>
              <CodeBlock
                label="delete-js"
                code={`const response = await fetch('/api/services/object-storage/buckets/files/delete', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    bucket_id: 'your-bucket-id',
    file_key: 'images/photo.jpg'
  })
});

const result = await response.json();
console.log(result);
// { success: true, message: "File deleted successfully" }`}
              />
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3 text-white/80">Example - cURL</h4>
              <CodeBlock
                label="delete-curl"
                code={`curl -X POST https://your-domain.com/api/services/object-storage/buckets/files/delete \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -d '{
    "bucket_id": "your-bucket-id",
    "file_key": "images/photo.jpg"
  }'`}
              />
            </div>

            <div className="bg-red-500/10 border border-red-500/20 rounded p-4">
              <p className="text-sm text-red-300">
                <strong>⚠️ Warning:</strong> Deleted files cannot be recovered unless versioning is enabled on your bucket.
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Authentication Note */}
      <div className="border border-white/10 rounded-lg p-6 bg-white/5">
        <h3 className="text-lg font-semibold mb-3">Authentication</h3>
        <p className="text-white/60 text-sm mb-4">
          All API endpoints require authentication. Include your authentication token in the request headers:
        </p>
        <CodeBlock
          label="auth"
          code={`headers: {
  'Authorization': 'Bearer YOUR_AUTH_TOKEN',
  'Content-Type': 'application/json'
}`}
        />
      </div>

      {/* Error Responses */}
      <div className="border border-white/10 rounded-lg p-6 bg-white/5">
        <h3 className="text-lg font-semibold mb-3">Common Error Responses</h3>
        <div className="space-y-3 text-sm">
          <div className="border border-white/10 rounded p-3 bg-black/30">
            <code className="text-red-400">400 Bad Request</code>
            <p className="text-white/60 mt-1">Missing or invalid parameters</p>
          </div>
          <div className="border border-white/10 rounded p-3 bg-black/30">
            <code className="text-red-400">401 Unauthorized</code>
            <p className="text-white/60 mt-1">Missing or invalid authentication token</p>
          </div>
          <div className="border border-white/10 rounded p-3 bg-black/30">
            <code className="text-red-400">403 Forbidden</code>
            <p className="text-white/60 mt-1">You don't have permission to access this bucket</p>
          </div>
          <div className="border border-white/10 rounded p-3 bg-black/30">
            <code className="text-red-400">404 Not Found</code>
            <p className="text-white/60 mt-1">Bucket or file not found</p>
          </div>
          <div className="border border-white/10 rounded p-3 bg-black/30">
            <code className="text-red-400">500 Internal Server Error</code>
            <p className="text-white/60 mt-1">Server error - try again later</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ApiDocumentation;
