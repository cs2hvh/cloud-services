import { JenkinsService } from "@/lib/services/jenkins";
import type { CustomProfileSpec } from "@/lib/jenkins/pipelines";

export class JenkinsBuildAdapter {
  getJobName(appName: string) {
    return `${appName}-job`;
  }

  getResizeJobName(appName: string) {
    return JenkinsService.getResizeJobName(appName);
  }

  getBuildUrl(appName: string, buildNumber: number) {
    const baseUrl = process.env.JENKINS_URL || "";
    const safeBase = baseUrl.replace(/\/$/, "").replace(/\/\/[^@]+@/, "//");
    return `${safeBase}/job/${this.getJobName(appName)}/${buildNumber}/`;
  }

  getResizeBuildUrl(appName: string, buildNumber: number) {
    const baseUrl = process.env.JENKINS_URL || "";
    const safeBase = baseUrl.replace(/\/$/, "").replace(/\/\/[^@]+@/, "//");
    return `${safeBase}/job/${this.getResizeJobName(appName)}/${buildNumber}/`;
  }

  async triggerBuild(params: {
    appName: string;
    commitSha?: string;
    gitAuthUrl?: string;
  }) {
    const buildNumber = await JenkinsService.triggerBuild(
      params.appName,
      params.commitSha,
      params.gitAuthUrl
    );

    return {
      buildNumber,
      jobName: this.getJobName(params.appName),
      url: this.getBuildUrl(params.appName, buildNumber),
    };
  }

  async triggerResizeBuild(params: { appName: string }) {
    const buildNumber = await JenkinsService.triggerResizeBuild(params.appName);

    return {
      buildNumber,
      jobName: this.getResizeJobName(params.appName),
      url: this.getResizeBuildUrl(params.appName, buildNumber),
    };
  }

  async createJobAndTrigger(params: {
    appName: string;
    appId: string;
    gitUrl: string;
    branch: string;
    framework?: string;
    size: string;
    deployTrigger: "manual" | "webhook";
    envVars: Array<{ key: string; value: string }>;
    containerPort?: number;
    gitAuthUrl?: string;
    healthcheckPath?: string;
    customSpec?: CustomProfileSpec;
  }) {
    await JenkinsService.createJob(
      params.appName,
      params.appId,
      params.gitUrl,
      params.branch,
      params.framework,
      params.size,
      params.deployTrigger,
      params.envVars,
      params.containerPort,
      params.gitAuthUrl,
      params.healthcheckPath,
      params.customSpec,
    );

    return {
      buildNumber: 1,
      jobName: this.getJobName(params.appName),
      url: this.getBuildUrl(params.appName, 1),
    };
  }
}
