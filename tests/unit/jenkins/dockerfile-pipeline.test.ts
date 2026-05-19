import { describe, expect, it } from "vitest";
import {
  createDockerfilePipeline,
  getPipelineGenerator,
  PipelineType,
} from "@/lib/jenkins/pipelines";

describe("Dockerfile pipeline", () => {
  it("is available from the pipeline factory", () => {
    expect(getPipelineGenerator(PipelineType.DOCKERFILE)).toBe(createDockerfilePipeline);
  });

  it("uses the provided custom container port", () => {
    const xml = createDockerfilePipeline(
      "custom-app",
      "https://github.com/example/custom-app",
      "main",
      "small",
      "example.com",
      "app_123",
      "",
      "",
      "manual",
      [],
      4321,
    );

    expect(xml).toContain("Generic Dockerfile Pipeline for custom-app");
    expect(xml).toContain("stage('Validate Dockerfile')");
    expect(xml).toContain("CONTAINER_PORT = '4321'");
    expect(xml).toContain("containerPort: 4321");
  });
});
