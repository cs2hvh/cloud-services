import GameServerSelect from "@/components/dashboard/game/new";
import { SidebarLayout } from "@/components/dashboard/sidebar/layout";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { Separator } from "@/components/ui/separator";
import { Products } from "@/lib/supabase/queries";
import ptero_axios from "@/lib/pterodactyl";
import { Suspense } from "react";

const GameNewSuspense = async () => {
    const products = await Products.get_by_type("game")
    const { data } = await ptero_axios.get("/api/application/locations")

    return <GameServerSelect locations={data.data} products={products} />
}

const GameNewPage = () => {
    return (
        <SidebarLayout>
            <div className="flex justify-between pt-4">
                <div>
                    <h2 className="text-2xl font-bold">New Game Server</h2>
                    <p className="text-muted-foreground">
                        Host a new Game Server
                    </p>
                </div>
            </div>
            <Separator className="my-4" />
            <Suspense fallback={<LoadingSpinner />}>
                <GameNewSuspense />
            </Suspense>
        </SidebarLayout>
    )
}

export default GameNewPage