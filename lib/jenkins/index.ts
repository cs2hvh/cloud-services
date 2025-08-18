// jenkinsClient.ts

// @ts-expect-error (if needed, because jenkins doesn't have official TS declarations)
import Jenkins from "jenkins";

const jenkins = new Jenkins({
  baseUrl: process.env.JENKINS_URL,
  crumbIssuer: true,
  //   promisify: true,
});

export default jenkins;
