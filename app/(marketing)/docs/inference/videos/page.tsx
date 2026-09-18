import { Code, CodeTabs } from "@/components/docs/code";
import { docsMetadata } from "@/components/docs/metadata";
import { A, C, Callout, DocPage, Endpoint, H2, Li, P, Params, Table, Ul } from "@/components/docs/primitives";

export const metadata = docsMetadata({
  title: "Videos — Inference API — AhuraSense Docs",
  description:
    "POST /v1/videos: start a video generation job, poll it, and download the file. Billed per second of output on completion.",
  path: "/docs/inference/videos",
});

const HREF = "/docs/inference/videos";

export default function VideosPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="API reference"
      title="Videos"
      lede="Video takes time, so it is a job: submit it, poll until it completes, download the file. The shapes follow OpenAI’s video API. You are billed per second of finished video, at the rate for the resolution you chose, and only when the job completes."
    >
      <H2>Submit</H2>
      <Endpoint method="POST" path="/v1/videos" />
      <CodeTabs
        tabs={[
          {
            label: "curl",
            lang: "bash",
            code: `curl https://api.ahurasense.com/v1/videos \\
  -H "Authorization: Bearer $AHURA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "x-ai/grok-imagine-video-1.5",
    "prompt": "A paper boat drifting on a calm pond at sunrise, soft light.",
    "duration_seconds": 5,
    "resolution": "720p",
    "ratio": "16:9"
  }'`,
          },
          {
            label: "Python",
            lang: "python",
            code: `import os, time, requests

H = {"Authorization": f"Bearer {os.environ['AHURA_API_KEY']}"}
BASE = "https://api.ahurasense.com/v1"

job = requests.post(f"{BASE}/videos", headers=H, json={
    "model": "x-ai/grok-imagine-video-1.5",
    "prompt": "A paper boat drifting on a calm pond at sunrise, soft light.",
    "duration_seconds": 5,
    "resolution": "720p",
    "ratio": "16:9",
}).json()

while job["status"] not in ("completed", "failed", "cancelled"):
    time.sleep(5)
    job = requests.get(f"{BASE}/videos/{job['id']}", headers=H).json()

if job["status"] == "completed":
    mp4 = requests.get(f"{BASE}{job['content_url']}", headers=H).content
    open("boat.mp4", "wb").write(mp4)`,
          },
        ]}
      />
      <Params
        items={[
          { name: "model", type: "string", required: true, children: <>A catalog id whose modality is <C>video</C>. See <A href="/docs/inference/models">Models</A>.</> },
          { name: "prompt", type: "string", required: true, children: <>What to generate, up to 4,000 characters.</> },
          { name: "duration_seconds", type: "integer", required: true, children: <>Whole seconds, within the model’s range in <C>capabilities.duration_seconds</C>. This is what you pay for.</> },
          { name: "resolution", type: "string", required: true, children: <>One of the model’s <C>capabilities.resolutions</C>, such as <C>480p</C>, <C>720p</C>, <C>1080p</C> or <C>4K</C>. Decides the per-second rate.</> },
          { name: "ratio", type: "string", children: <>Aspect ratio, such as <C>16:9</C> or <C>9:16</C>. Unsupported values are refused with <C>video_ratio_invalid</C>.</> },
          { name: "mode", type: "string", defaultValue: "text_to_video", children: <>Generation mode. Text to video is the default; other modes depend on the model.</> },
        ]}
      />
      <P>The response is <C>202 Accepted</C> with the job:</P>
      <Code lang="json" title="response">{`{
  "id": "video_3be098cc-0311-42cd-aec6-849c107d0c76",
  "object": "video",
  "status": "in_progress",
  "model": "x-ai/grok-imagine-video-1.5",
  "mode": "text_to_video",
  "prompt": "A paper boat drifting on a calm pond at sunrise, soft light.",
  "duration_seconds": 5,
  "ratio": "16:9",
  "resolution": "720p",
  "created_at": "2026-09-18T15:09:58.184Z",
  "completed_at": null,
  "error": null,
  "content_url": null,
  "content_expires_at": null
}`}</Code>

      <H2>Poll</H2>
      <Endpoint method="GET" path="/v1/videos/{id}" />
      <P>
        Returns the same job object, refreshed. Poll every few seconds; a short clip finishes in
        under a minute, a 30-second one can take several. Terminal statuses are{" "}
        <C>completed</C>, <C>failed</C> and <C>cancelled</C>. On completion <C>content_url</C> is
        set and <C>content_expires_at</C> says how long the file is kept.
      </P>
      <Table
        head={["Status", "Meaning"]}
        rows={[
          [<C key="0">queued</C>, "Accepted, not started. Usually gone within a second."],
          [<C key="1">in_progress</C>, "Generating. Keep polling."],
          [<C key="2">completed</C>, <>Done. Download from <C>content_url</C>. Billed now.</>],
          [<C key="3">failed</C>, <><C>error</C> carries a code and message. Not billed.</>],
          [<C key="4">cancelled</C>, "Stopped before completion. Not billed."],
        ]}
      />
      <P>
        You do not have to poll for billing to be correct. The gateway settles every open job on
        its own each minute, so a job you submit and walk away from is still billed when it
        completes, and still closed if it is lost.
      </P>

      <H2>Download</H2>
      <Endpoint method="GET" path="/v1/videos/{id}/content" />
      <P>
        Streams the MP4 with <C>Content-Type: video/mp4</C>. Before completion it answers{" "}
        <C>409 video_not_ready</C>; after the retention period it answers{" "}
        <C>410 video_content_expired</C>. Files are kept for seven days after completion, so copy
        the file to your own storage if you need it longer.
      </P>

      <H2>List</H2>
      <Endpoint method="GET" path="/v1/videos" />
      <P>Your organization’s twenty most recent jobs, newest first, in the same shape.</P>

      <H2>Billing</H2>
      <Ul>
        <Li>Cost is <C>duration_seconds</C> times the per-second rate for the resolution, from the model’s <C>prices</C> block in <C>GET /v1/models</C>.</Li>
        <Li>Charged once, when the job completes. Failed and cancelled jobs cost nothing.</Li>
        <Li>Video is available on platform billing; keys on BYOK billing are refused with <C>byok_unsupported</C>.</Li>
      </Ul>

      <H2>Errors</H2>
      <Table
        head={["Status", "Code", "Meaning"]}
        rows={[
          ["400", <C key="1">video_duration_invalid</C>, "Outside the model’s range, or not a whole number."],
          ["400", <C key="2">video_resolution_unsupported</C>, "Not one the model offers; the message lists them."],
          ["400", <C key="3">video_ratio_invalid</C>, "The aspect ratio is not supported."],
          ["400", <C key="4">video_mode_unsupported</C>, "The model does not support that mode."],
          ["404", <C key="5">video_not_found</C>, "No such job in your organization."],
          ["409", <C key="6">video_not_ready</C>, "Content requested before completion."],
          ["410", <C key="7">video_content_expired</C>, "The file is past its seven-day retention."],
          ["503", <C key="8">media_unavailable</C>, "The video service is down or overloaded. Retry after a few seconds."],
        ]}
      />
      <Callout kind="note" title="Not yet">
        Reference images, audio and video inputs are not accepted on this route yet; every job is
        text to video.
      </Callout>
    </DocPage>
  );
}
