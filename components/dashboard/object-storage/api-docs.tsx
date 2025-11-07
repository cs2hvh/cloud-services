"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  Copy,
  Check,
  Pyramid,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const Documentation = () => {
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

      <p className="text-sm text-blue-300">
        The following examples show how to upload a hello-world.txt object in
        multiple programming languages
      </p>

      {/* API Tabs */}
      <Tabs defaultValue="js" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 bg-white/5 border border-white/10">
          <TabsTrigger value="js" className="cursor-pointer data-[state=active]:bg-white/10">
            <Pyramid className="h-4 w-4 mr-2" />
            Js
          </TabsTrigger>
          <TabsTrigger
            value="python"
            className="cursor-pointer data-[state=active]:bg-white/10"
          >
            <Pyramid className="h-4 w-4 mr-2" />
            Python
          </TabsTrigger>
          <TabsTrigger value="ruby" className="cursor-pointer data-[state=active]:bg-white/10">
            <Pyramid className="h-4 w-4 mr-2" />
            Ruby
          </TabsTrigger>
          <TabsTrigger value="curl" className="cursor-pointer data-[state=active]:bg-white/10">
            <Pyramid className="h-4 w-4 mr-2" />
            Curl
          </TabsTrigger>
          {/* <TabsTrigger
            value="upload"
            className="cursor-pointer data-[state=active]:bg-white/10"
          >
            <Pyramid className="h-4 w-4 mr-2" />
            Curl
          </TabsTrigger> */}
        </TabsList>
        {/* Upload File */}
        <TabsContent value="js" className="space-y-6">
          <div className="border border-white/10 rounded-lg p-6 bg-white/5 space-y-4">
            <div>
              <h4 className="text-sm font-semibold mb-3 text-white/80">
                Example - js function
              </h4>
              <CodeBlock
                label="js file"
                code={`import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  endpoint: "https://nyc3.digitaloceanspaces.com",
  forcePathStyle: false,
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.SPACES_KEY,
    secretAccessKey: process.env.SPACES_SECRET
  }
});

const params = {
  Bucket: "example-space",
  Key: "hello-world.txt",
  Body: "Hello, World!",
  ACL: "private"
};

const uploadObject = async () => {
  try {
    await s3Client.send(new PutObjectCommand(params));
    console.log("Upload successful");
  } catch (err) {
    console.error("Error", err);
  }
};

uploadObject();`}
              />
            </div>
          </div>
        </TabsContent>
        {/* List Files */}
        <TabsContent value="python" className="space-y-6">
          <div className="border border-white/10 rounded-lg p-6 bg-white/5 space-y-4">
            <div>
              <h4 className="text-sm font-semibold mb-3 text-white/80">
                Example - python function
              </h4>
              <CodeBlock
                label="js file"
                code={`import os
import boto3
import botocore.config

session = boto3.session.Session()
client = session.client(
    's3',
    endpoint_url='https://nyc3.digitaloceanspaces.com',
    config=botocore.config.Config(s3={'addressing_style': 'virtual'}),
    region_name='nyc3',
    aws_access_key_id=os.getenv('SPACES_KEY'),
    aws_secret_access_key=os.getenv('SPACES_SECRET')
)

client.put_object(
    Bucket='example-space',
    Key='hello-world.txt',
    Body=b'Hello, World!',
    ACL='private'
)

print("Upload successful")`}
              />
            </div>
          </div>
        </TabsContent>
        {/* Download File */}
        <TabsContent value="ruby" className="space-y-6">
          <div className="border border-white/10 rounded-lg p-6 bg-white/5 space-y-4">
            <div>
              <h4 className="text-sm font-semibold mb-3 text-white/80">
                Example - Ruby function
              </h4>
              <CodeBlock
                label="js file"
                code={`require 'aws-sdk-s3'

client = Aws::S3::Client.new(
  access_key_id: ENV['SPACES_KEY'],
  secret_access_key: ENV['SPACES_SECRET'],
  endpoint: 'https://nyc3.digitaloceanspaces.com',
  force_path_style: false,
  region: 'us-east-1'
)

client.put_object(
  bucket: "example-space",
  key: "hello-world.txt",
  body: "Hello, World!",
  acl: "private"
)

puts "Upload successful"`}
              />
            </div>
          </div>
        </TabsContent>
        {/* Delete File */}
        <TabsContent value="curl" className="space-y-6">
          <div className="border border-white/10 rounded-lg p-6 bg-white/5 space-y-4">
            <div>
              <h4 className="text-sm font-semibold mb-3 text-white/80">
                Example - cURL
              </h4>
              <CodeBlock
                label="delete-curl"
                code={`SPACE="example-space"
REGION="nyc3"
KEY="$SPACES_KEY"
SECRET="$SPACES_SECRET"
FILE="hello-world.txt"

echo "Hello, World!" > $FILE

DATE=$(date -R)
CONTENT_TYPE="text/plain"
ACL="x-amz-acl:private"
STRING="PUT\n\n$CONTENT_TYPE\n$DATE\n$ACL\n/$SPACE/$FILE"
SIGNATURE=$(echo -en "STRING" | openssl sha1 -hmac "SECRET" -binary | base64)

curl -X PUT -T "$FILE" \
  -H "Host: $SPACE.$REGION.digitaloceanspaces.com" \
  -H "Date: $DATE" \
  -H "Content-Type: $CONTENT_TYPE" \
  -H "$ACL" \
  -H "Authorization: AWS $KEY:$SIGNATURE" \
  "https://$SPACE.$REGION.digitaloceanspaces.com/$FILE"`}
              />
            </div>
          </div>
        </TabsContent>
        If you can upload and retrieve this file successfully, your Spaces
        configuration with s3cmd and your chosen SDK is working correctly.
      </Tabs>
    </motion.div>
  );
};

export default Documentation;
