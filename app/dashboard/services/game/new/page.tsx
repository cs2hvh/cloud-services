import GameServerSelect from "@/components/dashboard/game/new";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { Products } from "@/lib/supabase/queries";
import ptero_axios from "@/lib/pterodactyl";
import { Suspense } from "react";

export const dynamic = "force-dynamic";
const GameNewSuspense = async () => {
  const products = await Products.get_by_type("game");
  const { data } = await ptero_axios.get("/api/application/locations");

  return <GameServerSelect locations={data.data} products={products} />;
};

const GameNewPage = () => {
  return (
    <div className="flex-1 bg-black min-h-screen">
      <div className="px-6 py-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">New Game Server</h1>
          <p className="text-gray-400">Deploy a new game server with automated setup and management</p>
        </div>
        
        <div className="border-t border-gray-800 pt-8">
          <Suspense fallback={
            <div className="flex items-center justify-center py-20">
              <LoadingSpinner />
            </div>
          }>
            <GameNewSuspense />
          </Suspense>
        </div>
      </div>
    </div>
  );
};

export default GameNewPage;
