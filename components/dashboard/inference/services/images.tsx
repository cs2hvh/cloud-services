"use client";

/**
 * Image generation service — POST /v1/images/generations
 *
 * Request:  { model, prompt, size?, response_format?, image_config? }
 * Response: { created, model, data: [{url}|{b64_json}], usage: {images} }
 *
 * Billing:  per image returned (cents_per_image in inference.models.pricing)
 */

import { useCallback, useMemo, useState } from "react";
import type { ServiceModel } from "@/components/dashboard/inference/playground";
import { MONO } from "@/components/dashboard/inference/chrome";
import { CARD, FieldLabel, INPUT_CLS, TEXTAREA_CLS, ServiceShell } from "./_shell";

const ENDPOINT = "/images/generations";
const FALLBACK_MODEL_ID = "ahura/image-gen";
const FALLBACK_MODEL_LABEL = "Image Gen";

type ResponseFormat = "url" | "b64_json";

interface ImageData {
  data: Array<{ url?: string; b64_json?: string }>;
  usage?: { images?: number };
}

interface GeneratedImage {
  src: string;
  kind: ResponseFormat;
}

export function ImagesService({
  apiBase,
  models,
  tabBar,
}: {
  apiBase: string;
  models: ServiceModel[];
  tabBar?: React.ReactNode;
}) {
  const modelOptions = useMemo(
    () =>
      models.length > 0
        ? models.map((m) => ({ id: m.model_id, label: m.display_name, tier: m.tier }))
        : [{ id: FALLBACK_MODEL_ID, label: FALLBACK_MODEL_LABEL, tier: null }],
    [models]
  );

  const [modelId, setModelId] = useState(modelOptions[0]?.id ?? FALLBACK_MODEL_ID);
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [responseFormat, setResponseFormat] = useState<ResponseFormat>("url");
  const [imageSize, setImageSize] = useState("1K");
  const [images, setImages] = useState<GeneratedImage[] | null>(null);
  const [usageImages, setUsageImages] = useState<number | null>(null);

  const selectedModel =
    modelOptions.find((m) => m.id === modelId) ?? modelOptions[0] ?? {
      id: FALLBACK_MODEL_ID,
      label: FALLBACK_MODEL_LABEL,
    };

  const canRun = prompt.trim().length > 0;

  const body = useMemo(
    () => ({
      model: selectedModel.id,
      prompt: prompt.trim(),
      size,
      response_format: responseFormat,
      image_config: {
        image_size: imageSize,
      },
    }),
    [selectedModel.id, prompt, size, responseFormat, imageSize]
  );

  const onSuccess = useCallback((data: unknown) => {
    const d = data as ImageData;
    const nextImages = (d.data ?? [])
      .map((item): GeneratedImage | null => {
        if (item.url) return { src: item.url, kind: "url" };
        if (item.b64_json) return { src: `data:image/png;base64,${item.b64_json}`, kind: "b64_json" };
        return null;
      })
      .filter((item): item is GeneratedImage => item !== null);

    setImages(nextImages);
    setUsageImages(d.usage?.images ?? nextImages.length);
  }, []);

  const codeSnippet = useMemo(
    () =>
      `curl ${apiBase}${ENDPOINT} \\\n` +
      `  -H "Authorization: Bearer <YOUR_KEY>" \\\n` +
      `  -H "Content-Type: application/json" \\\n` +
      `  -d '${JSON.stringify(body, null, 2)}'`,
    [apiBase, body]
  );

  return (
    <ServiceShell
      tabBar={tabBar}
      apiBase={apiBase}
      modelId={selectedModel.id}
      modelLabel={selectedModel.label}
      endpoint={ENDPOINT}
      description="Generate images from text prompts with an OpenAI-compatible request shape."
      body={body}
      canRun={canRun}
      onSuccess={onSuccess}
      renderForm={
        <ImagesForm
          modelId={selectedModel.id}
          setModelId={setModelId}
          models={modelOptions}
          prompt={prompt}
          setPrompt={setPrompt}
          size={size}
          setSize={setSize}
          responseFormat={responseFormat}
          setResponseFormat={setResponseFormat}
          imageSize={imageSize}
          setImageSize={setImageSize}
        />
      }
      renderResults={images ? <ImageResults images={images} /> : null}
      usageLabel={
        usageImages !== null
          ? `${usageImages} image${usageImages !== 1 ? "s" : ""} generated`
          : null
      }
      codeSnippet={codeSnippet}
    />
  );
}

function ImagesForm({
  modelId,
  setModelId,
  models,
  prompt,
  setPrompt,
  size,
  setSize,
  responseFormat,
  setResponseFormat,
  imageSize,
  setImageSize,
}: {
  modelId: string;
  setModelId: (v: string) => void;
  models: Array<{ id: string; label: string; tier: string | null }>;
  prompt: string;
  setPrompt: (v: string) => void;
  size: string;
  setSize: (v: string) => void;
  responseFormat: ResponseFormat;
  setResponseFormat: (v: ResponseFormat) => void;
  imageSize: string;
  setImageSize: (v: string) => void;
}) {
  return (
    <>
      <div>
        <FieldLabel>Model</FieldLabel>
        <select
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          className={`${INPUT_CLS} appearance-none`}
        >
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}{model.tier === "pro" ? " · Pro" : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <FieldLabel>Prompt</FieldLabel>
        <textarea
          rows={6}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A product photo of a matte black wearable device on a clean studio surface..."
          className={TEXTAREA_CLS}
        />
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div>
          <FieldLabel>Size</FieldLabel>
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className={`${INPUT_CLS} appearance-none`}
          >
            <option value="1024x1024">1024 x 1024</option>
            <option value="1536x1024">1536 x 1024</option>
            <option value="1024x1536">1024 x 1536</option>
            <option value="1792x1024">1792 x 1024</option>
            <option value="1024x1792">1024 x 1792</option>
          </select>
        </div>

        <div>
          <FieldLabel>Image Quality</FieldLabel>
          <select
            value={imageSize}
            onChange={(e) => setImageSize(e.target.value)}
            className={`${INPUT_CLS} appearance-none`}
          >
            <option value="1K">1K</option>
            <option value="2K">2K</option>
            <option value="4K">4K</option>
          </select>
        </div>

        <div>
          <FieldLabel>Response</FieldLabel>
          <select
            value={responseFormat}
            onChange={(e) => setResponseFormat(e.target.value as ResponseFormat)}
            className={`${INPUT_CLS} appearance-none`}
          >
            <option value="url">url</option>
            <option value="b64_json">b64_json</option>
          </select>
        </div>
      </div>
    </>
  );
}

function ImageResults({ images }: { images: GeneratedImage[] }) {
  return (
    <div className={CARD}>
      <div className={`${MONO} px-5 pt-4 pb-3 text-[10.5px] uppercase tracking-[0.13em] text-white/45 font-semibold border-b border-white/[0.05]`}>
        Generated Images
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5">
        {images.map((image, index) => (
          <figure key={`${image.src.slice(0, 48)}-${index}`} className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.src}
              alt={`Generated image ${index + 1}`}
              className="w-full rounded-[8px] border border-white/[0.08] bg-black object-cover"
            />
            <figcaption className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/35`}>
              {image.kind}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
