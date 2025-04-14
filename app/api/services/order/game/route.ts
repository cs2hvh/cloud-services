import query from "@/lib/db/mysql";
import { DB_GameServer } from "@/lib/db/mysql/types";
import { validateRequest } from "@/lib/lucia/auth";
import ptero_axios from "@/lib/pterodactyl";
import { getPterodactylGameConfig } from "@/lib/pterodactyl/manifest";
import { getRandomPort } from "@/lib/utils";
import { PP_Allocation, PP_Node } from "@/types/pterodactyl";
import { AxiosError } from "axios";


export async function POST(request: Request) {
    try {
        const { name, game_type, plan_id, location, projectid, additional_services } = await request.json(); // Exclude ports from the request

        const { user } = await validateRequest();

        if (!user) {
            return new Response("User not found", { status: 404 });
        }

        const product = await query.products.get_by_id(plan_id);

        if (!product) {
            return new Response("Product not found", { status: 404 });
        }

        // Step 3: Get all nodes
        const nodesResponse = await ptero_axios.get("/api/application/nodes");
        const nodes: PP_Node[] = nodesResponse.data.data;

        // Step 4: Filter nodes based on location and available resources
        const availableNodes = nodes.filter(node => {
            const isCorrectLocation = node.attributes.location_id === Number(location);

            // Calculate remaining resources
            const allocatedMemory = node.attributes.allocated_resources.memory;
            const allocatedDisk = node.attributes.allocated_resources.disk;

            const remainingMemory = node.attributes.memory - allocatedMemory;
            const remainingDisk = node.attributes.disk - allocatedDisk;

            const hasEnoughMemory = remainingMemory >= product.resources.ram;
            const hasEnoughDisk = remainingDisk >= product.resources.storage;

            return isCorrectLocation && hasEnoughMemory && hasEnoughDisk;
        });

        // Step 5: Check allocations for the first available node
        if (availableNodes.length > 0) {
            const firstAvailableNode = availableNodes[0]; // Change this logic if needed
            const nodeId = firstAvailableNode.attributes.id;

            // Step 6: Check for unassigned allocations
            const allocationsResponse = await ptero_axios.get(`/api/application/nodes/${nodeId}/allocations`);
            const allocations: PP_Allocation[] = allocationsResponse.data.data;

            // Get existing assigned ports
            const existingPorts = allocations
                .filter(allocation => allocation.attributes.assigned)
                .map(allocation => allocation.attributes.port);

            // Generate a random port that is not already in use
            const randomPort = getRandomPort(existingPorts);

            let allocationId: number;

            const unassignedAllocation = allocations.find(allocation => !allocation.attributes.assigned);
            if (unassignedAllocation) {
                // Use the unassigned allocation's ID
                allocationId = unassignedAllocation.attributes.id;
            } else {
                // Step 7: Create a new allocation if none are unassigned
                const payload = {
                    ip: allocations[0].attributes.ip, // Use a default IP or modify this as needed
                    ports: [randomPort.toString()] // Ensure the port is a string in an array
                };
                // Step 8: Retrieve all allocations again to get the newly created one
                const newAllocationsResponse = await ptero_axios.get(`/api/application/nodes/${nodeId}/allocations`);
                const newAllocations: PP_Allocation[] = newAllocationsResponse.data.data;

                // Find the newly created allocation
                allocationId = newAllocations.find(allocation => !allocation.attributes.assigned && allocation.attributes.port === randomPort)?.attributes.id!;

                // Check if we found the new allocation ID
                if (!allocationId) {
                    return new Response("Failed to find the newly created allocation", { status: 500 });
                }
            }

            // console.log(availableNodes, allocationId, randomPort);
            const payload = getPterodactylGameConfig(name, 1, game_type, product.resources.ram * 1000, 0, product.resources.storage * 1000, allocationId)
            // console.log(payload)
            const response = await ptero_axios.post("/api/application/servers", payload);
            const svData: ServerData = response.data.attributes

            const today = new Date();
            const endsAt = new Date(today.setDate(today.getDate() + 30));

            await query.gameservers.create({
                name,
                id: svData.id,
                game_type,
                ip: allocations[0].attributes.ip,
                port: randomPort,
                node: svData.node,
                identifier: svData.identifier,
                allocation: svData.allocation,
                ends_at: endsAt,
                plan: plan_id,
                status: "active",
                userid: user.id,
                location,
                projectid,
                resources: product.resources
            } as Partial<DB_GameServer>)

            // Optionally, return the allocation ID or any other relevant information
            return new Response(`Successfully created ${name} server.`, { status: 200 });
        } else {
            return new Response("No available nodes found", { status: 404 });
        }

    } catch (error) {
        // console.error(error); // Log the error for debugging
        const aerror = error as AxiosError<{ response?: string }>;
        console.log(aerror.response?.data)
        return new Response("Something went wrong :(", {
            status: 500
        });
    }
}

interface ServerData {
    id: number;
    external_id: string | null;
    uuid: string;
    identifier: string;
    name: string;
    description: string;
    status: string;
    suspended: boolean;
    limits: {
        memory: number;
        swap: number;
        disk: number;
        io: number;
        cpu: number;
        threads: number | null;
        oom_disabled: boolean;
    };
    feature_limits: {
        databases: number;
        allocations: number;
        backups: number;
    };
    user: number;
    node: number;
    allocation: number;
    nest: number;
    egg: number;
    container: {
        startup_command: string;
        image: string;
        installed: number;
        environment: Record<string, string>;
    };
    updated_at: string;
    created_at: string;
};
