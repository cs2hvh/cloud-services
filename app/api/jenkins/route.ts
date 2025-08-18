
// import { validateRequest } from '@/lib/auth';
// import cloudflare from '@/lib/cloudflare';
// import query from '@/lib/db';
// import jenkins from '@/lib/jenkins';
// import { createPipelineXml } from '@/lib/jenkins/pipeline';
// import { generateIdFromEntropySize } from 'lucia';
// import { NextResponse } from 'next/server';

// /**
//  * Triggers a build for the specified Jenkins job.
//  * 
//  * @param jobName - The name of the Jenkins job to trigger.
//  * @param parameters - Optional build parameters for parameterized jobs.
//  */
// async function triggerJenkinsJob(
//     jobName: string,
//     parameters?: { [key: string]: string }
// ): Promise<void> {
//     try {
//         // If the job is parameterized, pass the parameters.
//         // Otherwise, for a non-parameterized job, no additional parameters need to be passed.
//         const queueId = await jenkins.job.build(jobName, parameters);

//         console.log(`Job "${jobName}" triggered successfully. Queue ID: ${queueId}`);
//     } catch (error) {
//         console.error(`Error triggering job "${jobName}":`, error);
//         throw error;
//     }
// }

// async function createJob(name: string, github: string, branch: string, port: string) {
//     try {
//         const jobName = `${name}-job`;
//         const pipeline = createPipelineXml(name, github, branch, port)
//         // Create job in Jenkins
//         await jenkins.job.create(jobName, pipeline);
//         setTimeout(async () => {
//             await triggerJenkinsJob(jobName);
//         }, 2000);

//         console.log(`Job "${jobName}" created successfully!`);
//     } catch (error) {
//         console.error('Error creating job:', error);
//         throw error;
//     }
// }

// // Handle GET requests: create the job and respond
// export async function POST(request: Request) {
//     try {
//         const { name, github, branch, buildCommand } = await request.json();

//         if (!name || !github || !branch || !buildCommand) {
//             return new Response("Not Found", { status: 404 })
//         }

//         const { user } = await validateRequest();

//         if (!user) {
//             return new Response("Access Denied.", { status: 403 })
//         }

//         const usedPorts = await query.apps.getUsedPorts();
//         let availablePort = null;
//         for (let port = 31000; port <= 32000; port++) {
//             if (!usedPorts.includes(port)) {
//                 availablePort = port;
//                 break;
//             }
//         }

//         if (!availablePort) {
//             console.error("No available ports")
//             return new Response("No available ports", { status: 500 });
//         }

//         const id = generateIdFromEntropySize(10)

//         await query.apps.create({
//             id,
//             github_url: github,
//             name,
//             userid: user.id,
//             port: availablePort
//         })

//         await cloudflare.dns.records.create({
//             type: "A",
//             name,
//             proxied: false,
//             content: process.env.KUBE_IP,
//             ttl: 0,
//             zone_id: process.env.CLOUDFLARE_ZONE_ID!
//         });

//         await createJob(name, github, branch, availablePort.toString());
//         return NextResponse.json({ message: 'Created App Successfully!' });
//     } catch (error) {
//         console.error(error);
//         return new Response(
//             JSON.stringify({ error: error || 'Something went wrong.' }),
//             { status: 500 }
//         );
//     }
// }