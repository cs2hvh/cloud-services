
export interface PP_Location {
    object: string;
    attributes: {
        id: number;
        short: string;
        long: string;
        updated_at: string;
        created_at: string;
    };
}

export interface PP_Node {
    object: "node";
    attributes: PP_NodeAttributes;
}

export interface PP_NodeAttributes {
    id: number;
    uuid: string;
    public: boolean;
    name: string;
    description: string | null;
    location_id: number;
    fqdn: string;
    scheme: string;
    behind_proxy: boolean;
    maintenance_mode: boolean;
    memory: number;
    memory_overallocate: number;
    disk: number;
    disk_overallocate: number;
    upload_size: number;
    daemon_listen: number;
    daemon_sftp: number;
    daemon_base: string;
    created_at: string; // ISO 8601 format
    updated_at: string; // ISO 8601 format
    allocated_resources: AllocatedResources;
}

interface AllocatedResources {
    memory: number;
    disk: number;
}

export interface PP_Allocation {
    object: "allocation";
    attributes: {
        id: number;
        ip: string;
        alias: string;
        port: number;
        notes: string | null;
        assigned: boolean;
    };
}