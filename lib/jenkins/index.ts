// @ts-expect-error (if needed, because jenkins doesn't have official TS declarations)
import Jenkins from 'jenkins';

type JenkinsClient = ReturnType<typeof Jenkins>;

let jenkinsInstance: JenkinsClient | null = null;

function getJenkins(): JenkinsClient {
  if (!jenkinsInstance) {
    if (!process.env.JENKINS_URL) {
      throw new Error('JENKINS_URL environment variable is not set');
    }
    jenkinsInstance = new Jenkins({
      baseUrl: process.env.JENKINS_URL,
      crumbIssuer: true,
    });
  }
  return jenkinsInstance;
}

const jenkins = new Proxy({} as JenkinsClient, {
  get(target, prop) {
    const instance = getJenkins();
    const value = instance[prop as keyof JenkinsClient];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  }
});

export default jenkins;
