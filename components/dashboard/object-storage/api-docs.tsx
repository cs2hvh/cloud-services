"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

// ─── Lightweight regex-based syntax highlighter ───────────────────────────────

type Token = { text: string; cls: string };

const RULES: Record<string, [RegExp, string][]> = {
  js: [
    [/^(\/\/[^\n]*)/, "text-white/35 italic"],
    [/^(`(?:[^`\\]|\\.|\n)*?`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/, "text-amber-300/90"],
    [/^(import|export|from|const|let|var|async|await|try|catch|new|return|function|class|typeof|throw|if|else|for|of|in|while)\b/, "text-violet-400"],
    [/^(process|console|undefined|null|true|false)\b/, "text-sky-300"],
    [/^\d+(?:\.\d+)?/, "text-cyan-300"],
    [/^[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\()/, "text-yellow-300"],
    [/^[a-zA-Z_$][a-zA-Z0-9_$]*/, "text-white/80"],
    [/^[\s\S]/, "text-white/40"],
  ],
  python: [
    [/^(#[^\n]*)/, "text-white/35 italic"],
    [/^("""[\s\S]*?"""|'''[\s\S]*?'''|"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')/, "text-amber-300/90"],
    [/^(import|from|as|def|class|return|if|elif|else|for|in|while|try|except|finally|with|lambda|not|and|or|is|None|True|False|pass|raise)\b/, "text-violet-400"],
    [/^(os|boto3|botocore|session|client|print)\b/, "text-sky-300"],
    [/^\d+(?:\.\d+)?/, "text-cyan-300"],
    [/^[a-zA-Z_][a-zA-Z0-9_]*(?=\s*\()/, "text-yellow-300"],
    [/^[a-zA-Z_][a-zA-Z0-9_]*/, "text-white/80"],
    [/^[\s\S]/, "text-white/40"],
  ],
  ruby: [
    [/^(#[^\n]*)/, "text-white/35 italic"],
    [/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/, "text-amber-300/90"],
    [/^(require|include|def|end|class|module|return|if|elsif|else|unless|while|for|do|yield|puts|raise|begin|rescue|ensure|true|false|nil)\b/, "text-violet-400"],
    [/^(Aws|ENV)\b/, "text-sky-300"],
    [/^\d+(?:\.\d+)?/, "text-cyan-300"],
    [/^:[a-zA-Z_][a-zA-Z0-9_]*/, "text-emerald-300"],
    [/^[a-zA-Z_][a-zA-Z0-9_?!]*(?=\s*\()/, "text-yellow-300"],
    [/^[a-zA-Z_][a-zA-Z0-9_]*/, "text-white/80"],
    [/^[\s\S]/, "text-white/40"],
  ],
  curl: [
    [/^(#[^\n]*)/, "text-white/35 italic"],
    [/^"(?:[^"\\]|\\.)*"/, "text-amber-300/90"],
    [/^\$\{?[A-Z_][A-Z0-9_]*\}?/, "text-cyan-300"],
    [/^(curl|echo|date|export|openssl|base64)\b/, "text-violet-400"],
    [/^-[a-zA-Z]+/, "text-sky-300"],
    [/^[A-Z_][A-Z0-9_]*(?==)/, "text-emerald-300"],
    [/^[a-zA-Z_][a-zA-Z0-9_]*/, "text-white/80"],
    [/^[\s\S]/, "text-white/40"],
  ],
};

function tokenize(code: string, lang: string): Token[] {
  const rules = RULES[lang] ?? RULES.js;
  const tokens: Token[] = [];
  let rem = code;
  while (rem.length > 0) {
    let matched = false;
    for (const [re, cls] of rules) {
      const m = rem.match(re);
      if (m) {
        tokens.push({ text: m[0], cls });
        rem = rem.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      tokens.push({ text: rem[0], cls: "text-white/40" });
      rem = rem.slice(1);
    }
  }
  return tokens;
}

// ─── CodeBlock component ──────────────────────────────────────────────────────

const LANG_LABELS: Record<string, string> = {
  js: "JavaScript",
  python: "Python",
  ruby: "Ruby",
  curl: "Bash / cURL",
};

interface CodeBlockProps {
  code: string;
  label: string;
  lang: string;
  copiedLabel: string | null;
  onCopy: (code: string, label: string) => void;
}

function CodeBlock({ code, label, lang, copiedLabel, onCopy }: CodeBlockProps) {
  const tokens = tokenize(code, lang);
  const isCopied = copiedLabel === label;
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-[#0d1117]">
      {/* title bar */}
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.025] px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/50" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/50" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/50" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/25">
          {LANG_LABELS[lang] ?? lang}
        </span>
        <button
          onClick={() => onCopy(code, label)}
          className="flex cursor-pointer items-center gap-1.5 rounded border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white/75"
        >
          {isCopied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      {/* code */}
      <div className="overflow-x-auto">
        <pre className="p-5 text-[13px] leading-[1.7]">
          <code className="font-mono">
            {tokens.map((tok, i) => (
              <span key={i} className={tok.cls}>
                {tok.text}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}

// ─── Documentation component ──────────────────────────────────────────────────

const Documentation = () => {
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  const handleCopy = (code: string, label: string) => {
    navigator.clipboard.writeText(code);
    setCopiedLabel(label);
    toast.success("Code copied to clipboard");
    setTimeout(() => setCopiedLabel(null), 2000);
  };

  return (
    <div className="glass-panel overflow-hidden">
      <div className="border-b border-white/[0.06] px-6 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
          API Reference
        </p>
        <h3 className="mt-1.5 text-lg font-semibold text-white">Code Samples</h3>
        <p className="mt-1 text-sm text-white/45">
          Example code for uploading objects to your bucket via the S3-compatible API.
        </p>
      </div>

      <div className="p-6">
        <Tabs defaultValue="js">
          <TabsList className="mb-5 h-auto w-fit rounded-lg border border-white/[0.08] bg-white/[0.03] p-1">
            {(["js", "python", "ruby", "curl"] as const).map((lang) => (
              <TabsTrigger
                key={lang}
                value={lang}
                className="cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium text-white/50 data-[state=active]:bg-white/[0.08] data-[state=active]:text-white data-[state=active]:shadow-none"
              >
                {LANG_LABELS[lang]}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="js">
            <CodeBlock
              lang="js" label="js" copiedLabel={copiedLabel} onCopy={handleCopy}
              code={`import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  endpoint: "https://YOUR_URL",
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
          </TabsContent>

          <TabsContent value="python">
            <CodeBlock
              lang="python" label="python" copiedLabel={copiedLabel} onCopy={handleCopy}
              code={`import os
import boto3
import botocore.config

session = boto3.session.Session()
client = session.client(
    's3',
    endpoint_url='https://YOUR_URL',
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
          </TabsContent>

          <TabsContent value="ruby">
            <CodeBlock
              lang="ruby" label="ruby" copiedLabel={copiedLabel} onCopy={handleCopy}
              code={`require 'aws-sdk-s3'

client = Aws::S3::Client.new(
  access_key_id: ENV['SPACES_KEY'],
  secret_access_key: ENV['SPACES_SECRET'],
  endpoint: 'https://YOUR_URL',
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
          </TabsContent>

          <TabsContent value="curl">
            <CodeBlock
              lang="curl" label="curl" copiedLabel={copiedLabel} onCopy={handleCopy}
              code={`SPACE="example-space"
REGION="nyc3"
KEY="$SPACES_KEY"
SECRET="$SPACES_SECRET"
FILE="hello-world.txt"

echo "Hello, World!" > $FILE

DATE=$(date -R)
CONTENT_TYPE="text/plain"
ACL="x-amz-acl:private"
STRING="PUT\\n\\n$CONTENT_TYPE\\n$DATE\\n$ACL\\n/$SPACE/$FILE"
SIGNATURE=$(echo -en "STRING" | openssl sha1 -hmac "SECRET" -binary | base64)

curl -X PUT -T "$FILE" \\
  -H "Host: $SPACE.$REGION.ahurasense.com" \\
  -H "Date: $DATE" \\
  -H "Content-Type: $CONTENT_TYPE" \\
  -H "$ACL" \\
  -H "Authorization: AWS $KEY:$SIGNATURE" \\
  "https://$SPACE.$REGION.ahurasense.com/$FILE"`}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Documentation;
