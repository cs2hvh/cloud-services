import { JenkinsService } from "@/lib/services/jenkins";

export class JenkinsBuildAdapter {
  getJobName(appName: string) {
    return `${appName}-job`;
  }

  getBuildUrl(appName: string, buildNumber: number) {
    const baseUrl = process.env.JENKINS_URL || "";
    const safeBase = baseUrl.replace(/\/$/, "").replace(/\/\/[^@]+@/, "//");
    return `${safeBase}/job/${this.getJobName(appName)}/${buildNumber}/`;
  }

  async triggerBuild(params: {
    appName: string;
    commitSha?: string;
    resizeOnly?: boolean;
    gitAuthUrl?: string;
  }) {
    const buildNumber = await JenkinsService.triggerBuild(
      params.appName,
      params.commitSha,
      params.resizeOnly ?? false,
      params.gitAuthUrl
    );

    return {
      buildNumber,
      jobName: this.getJobName(params.appName),
      url: this.getBuildUrl(params.appName, buildNumber),
    };
  }

  async createJobAndTrigger(params: {
    appName: string;
    appId: string;
    gitUrl: string;
    branch: string;
    framework?: string;
    size: string;
    deployTrigger: "manual" | "webhook" | "resize";
    envVars: Array<{ key: string; value: string }>;
    containerPort?: number;
    gitAuthUrl?: string;
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
      params.gitAuthUrl
    );

    return {
      buildNumber: 1,
      jobName: this.getJobName(params.appName),
      url: this.getBuildUrl(params.appName, 1),
    };
  }
}
