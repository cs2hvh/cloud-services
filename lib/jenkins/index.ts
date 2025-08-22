// jenkinsClient.ts

// @ts-expect-error (if needed, because jenkins doesn't have official TS declarations)
import Jenkins from "jenkins";

let jenkins: InstanceType<typeof Jenkins> | null = null;

const getJenkinsClient = () => {
  if (!jenkins) {
    if (!process.env.JENKINS_URL) {
      throw new Error("JENKINS_URL environment variable is required");
    }
    
    jenkins = new Jenkins({
      baseUrl: process.env.JENKINS_URL,
      crumbIssuer: true,
      //   promisify: true,
    });
  }
  
  return jenkins;
};

export default getJenkinsClient;
