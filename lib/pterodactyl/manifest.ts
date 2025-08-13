type GameConfig = {
    name: string;
    user: number;
    egg: number;
    docker_image: string;
    startup: string;
    environment: Record<string, string>;
    limits: {
        memory: number;
        swap: number;
        disk: number;
        io: number;
        cpu: number;
    };
    feature_limits: {
        databases: number;
        backups: number;
    };
    allocation: {
        default: number;
    };
};

export const getPterodactylGameConfig = (name: string, user: number, game: string, memory: number, cpu: number, disk: number, allocation: number): GameConfig => {
    switch (game.toLowerCase()) {
        case "minecraft":
            return {
                name,
                user,
                egg: 1,
                docker_image: "ghcr.io/pterodactyl/yolks:java_21",
                startup: "java -Xms128M -XX:MaxRAMPercentage=95.0 -Dterminal.jline=false -Dterminal.ansi=true -jar {{SERVER_JARFILE}}",
                environment: {
                    BUILD_NUMBER: "latest",
                    SERVER_JARFILE: "server.jar",
                    STARTUP: "java -Xms128M -XX:MaxRAMPercentage=95.0 -jar {{SERVER_JARFILE}}"
                },
                limits: {
                    memory: memory, // Use the passed memory
                    swap: 0,
                    disk: disk, // Use the passed disk size
                    io: 500,
                    cpu: cpu // Use the passed CPU limit
                },
                feature_limits: {
                    databases: 0,
                    backups: 0
                },
                allocation: {
                    default: allocation
                }
            };
        case "cs2":
            return {
                name,
                user,
                egg: 15,
                docker_image: "ghcr.io/1zc/steamrt3-pterodactyl:latest",
                startup: "./game/cs2.sh -dedicated +ip 0.0.0.0 -port {{SERVER_PORT}} +map {{SRCDS_MAP}} -maxplayers {{SRCDS_MAXPLAYERS}} +sv_setsteamaccount {{STEAM_ACC}}",
                environment: {
                    "SRCDS_MAP": "de_dust2",
                    "SRCDS_APPID": "730",
                    "SRCDS_MAXPLAYERS": "64",
                    "SRCDS_STOP_UPDATE": "0",
                    "SRCDS_VALIDATE": "0",
                    "STEAM_ACC": "",
                    "STARTUP": "./game/cs2.sh -dedicated +ip 0.0.0.0 -port {{SERVER_PORT}} +map {{SRCDS_MAP}} -maxplayers {{SRCDS_MAXPLAYERS}} +sv_setsteamaccount {{STEAM_ACC}}",
                },
                limits: {
                    memory,
                    swap: 0,
                    disk,
                    io: 500,
                    cpu
                },
                feature_limits: {
                    databases: 0,
                    backups: 0
                },
                allocation: {
                    default: allocation
                }
            };
        case "rust":
            return {
                name,
                user,
                egg: 12,
                docker_image: "ghcr.io/pterodactyl/yolks:source_rust",
                startup: "./RustDedicated -batchmode +server.ip 0.0.0.0 -port {{SERVER_PORT}} +server.level \"{{RUST_LEVEL}}\" +server.hostname \"{{HOSTNAME}}\" +server.identity \"{{SERVER_IDENTITY}}\" +server.seed {{WORLD_SEED}} +rcon.port {{RCON_PORT}} +rcon.password \"{{RCON_PASSWORD}}\" +rcon.web 1",
                environment: {
                    HOSTNAME: "My Rust Server",
                    RUST_LEVEL: "Procedural Map",
                    SERVER_IDENTITY: "rust_server",
                    WORLD_SEED: "12345",
                    RCON_PORT: "28016",
                    RCON_PASSWORD: "changeme",
                    STARTUP: "./RustDedicated -batchmode +server.ip 0.0.0.0 -port {{SERVER_PORT}} +server.level \"{{RUST_LEVEL}}\" +server.hostname \"{{HOSTNAME}}\" +server.identity \"{{SERVER_IDENTITY}}\" +server.seed {{WORLD_SEED}} +rcon.port {{RCON_PORT}} +rcon.password \"{{RCON_PASSWORD}}\" +rcon.web 1"
                },
                limits: { memory, swap: 0, disk, io: 500, cpu },
                feature_limits: { databases: 0, backups: 0 },
                allocation: { default: allocation }
            };
        case "valheim":
            return {
                name,
                user,
                egg: 13,
                docker_image: "ghcr.io/pterodactyl/yolks:valheim",
                startup: "./valheim_server.x86_64 -name \"{{SERVER_NAME}}\" -port {{SERVER_PORT}} -world \"{{WORLD_NAME}}\" -password \"{{SERVER_PASS}}\" -public {{PUBLIC}}",
                environment: {
                    SERVER_NAME: "My Valheim Server",
                    WORLD_NAME: "Dedicated",
                    SERVER_PASS: "secret123",
                    PUBLIC: "1",
                    STARTUP: "./valheim_server.x86_64 -name \"{{SERVER_NAME}}\" -port {{SERVER_PORT}} -world \"{{WORLD_NAME}}\" -password \"{{SERVER_PASS}}\" -public {{PUBLIC}}"
                },
                limits: { memory, swap: 0, disk, io: 500, cpu },
                feature_limits: { databases: 0, backups: 0 },
                allocation: { default: allocation }
            };
        default:
            throw new Error("Unsupported game type");
    }
}
