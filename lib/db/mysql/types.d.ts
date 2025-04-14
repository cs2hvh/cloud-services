
import { RowDataPacket } from "mysql2";

const USER_ROLES = ["member", "admin", "users", "events", "giveaways", "application-forms", "form-submissions"] as const;
type UserRole = (typeof USER_ROLES)[number];
type ANSWER_TYPES = "image" | "text" | "paragraph" | "checkbox";

// User Interface
interface DB_User extends RowDataPacket {
    id: string;
    username: string;
    avatar: string;
    display_name: string;
    email: string;
    steam: string | null;
    discord: string | null;
    background: string;
    bio: string;
    suspend: boolean;
    roles: UserRole[];
    email_verified?: Date;
    created_at?: Date;
}

interface DB_OtpData extends RowDataPacket {
    id: number
    email: string
    otp_code: string
    created_at: Date
    expires_at: Date
    verified: number
}

// Session Interface
interface DB_Session extends RowDataPacket {
    id: string;
    expires_at: Date;
    user_id: string;
    created: Date;
    user_agent: string
    ip: string;
}

interface DB_Project extends RowDataPacket {
    id: string;
    name: string;
    description?: string;
    default: boolean;
    created: Date;
    owner: string;
    users: string[];
}

interface DB_ProjectLog extends RowDataPacket {
    id: number;
    event: string;
    text: string;
    created: Date;
    project_id: string
}

interface DB_Product extends RowDataPacket {
    id: string;
    name: string;
    description?: string;
    image?: string;
    type: 'vps' | 'vds' | 'game' | 'database';
    sub?: string;
    resources: {
        cpu: number;
        ram: number;
        storage: number;
        bandwith: number;
    };
    discount?: number; // as percentage, e.g. 10.5 means 10.5%
    price: number;     // in your chosen currency (e.g., USD)
    created: string;   // ISO 8601 timestamp format (e.g., "2025-04-12T14:22:00Z")
}

interface DB_Location {
    id: number;
    short: string;
    city: string;
    country: string; // optional for geographic location
    country_code: string;
    available: boolean;
}

interface DB_GameServer extends RowDataPacket {
    id: number;
    name: string;
    game_type: string;

    resources: {
        cpu: number;
        ram: number;
        storage: number;
        bandwith: number;
    };
    ip: string;
    port: number;
    node: number;
    identifier: string;
    allocation: number;

    ends_at: Date;   // ISO 8601 datetime or null
    plan: string;
    status: string;

    projectid: string;
    userid: string;
    location: number;
    created: string;          // ISO 8601 datetime
}

interface DB_Count extends RowDataPacket {
    'COUNT(*)': number
}