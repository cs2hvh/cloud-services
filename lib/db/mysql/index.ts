import GameServers from "./schema/game-servers";
import OTPS from "./schema/otps";
import Products from "./schema/products";
import Projects from "./schema/projects";
import Users from "./schema/users";

const query = {
    users: Users,
    otps: OTPS,
    projects: Projects,
    products: Products,
    gameservers: GameServers
};

export default query;