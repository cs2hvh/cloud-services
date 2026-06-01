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

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_DIM = "rgba(0,149,255,0.08)";

const LANG_LABELS: Record<string, string> = {
  js: "JavaScript",
  python: "Python",
  ruby: "Ruby",
  curl: "Bash / cURL",
};

const LANG_FILE: Record<string, string> = {
  js: "upload.mjs",
  python: "upload.py",
  ruby: "upload.rb",
  curl: "upload.sh",
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
    <div className="overflow-hidden border border-white/[0.06] bg-[#08090b] rounded-[6px]">
      {/* title bar */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
        <span
          className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/55 font-semibold`}
        >
          {LANG_FILE[lang] ?? lang}
        </span>
        <button
          onClick={() => onCopy(code, label)}
          className={`${MONO} inline-flex h-7 items-center gap-1.5 px-2.5 text-[10px] uppercase tracking-[0.12em] font-semibold border rounded-[4px] transition-colors`}
          style={
            isCopied
              ? {
                  color: "#4ade80",
                  borderColor: "rgba(74,222,128,0.3)",
                  background: "rgba(74,222,128,0.08)",
                }
              : {
                  color: "rgba(255,255,255,0.55)",
                  borderColor: "rgba(255,255,255,0.08)",
                  background: "#0d0e11",
                }
          }
        >
          {isCopied ? (
            <>
              <Check className="h-3 w-3" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
      </div>
      {/* code */}
      <div className="overflow-x-auto">
        <pre className={`${MONO} px-5 py-4 text-[12px] leading-[1.7]`}>
          <code>
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
    <div>
      <Tabs defaultValue="js">
        <TabsList className="bg-transparent p-0 h-auto inline-flex w-auto gap-1 rounded-none mb-4">
          {(["js", "python", "ruby", "curl"] as const).map((lang) => (
            <TabsTrigger
              key={lang}
              value={lang}
              className={`${MONO} flex-none inline-flex items-center h-8 px-3 text-[10.5px] uppercase tracking-[0.12em] font-semibold rounded-[4px] border transition-colors text-white/55 border-white/[0.08] bg-[#111216] hover:text-white hover:border-white/[0.14] data-[state=active]:text-[${ACCENT}] data-[state=active]:border-[rgba(0,149,255,0.4)] data-[state=active]:bg-[${ACCENT_DIM}] data-[state=active]:shadow-none`}
              style={{
                ["--accent" as string]: ACCENT,
              } as React.CSSProperties}
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
  );
};

export default Documentation;
