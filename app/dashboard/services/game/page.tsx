import query from "@/lib/db/mysql"
import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import GameServerGrid from "@/components/dashboard/projects/tabs/resources/grid";
import { SidebarLayout } from "@/components/dashboard/sidebar/layout";
import { Separator } from "@/components/ui/separator";
import { validateRequest } from "@/lib/lucia/auth";
import { notFound } from "next/navigation";
import { ErrorMessage } from "@/components/dashboard/utils/error";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";

const GameServiceSuspense = async () => {
    const { user } = await validateRequest();

    if (!user) {
        notFound()
    }

    const gameservers = await query.gameservers.get_by_userid(user.id);

    if (!gameservers) {
        return (
            <ErrorMessage message="Unable to load game servers. Please try again later." />
        )
    }

    return <GameServerGrid data={gameservers} />
}

const GameServicePage = () => {
    return (
        <SidebarLayout>
            <div className="flex justify-between pt-4 items-center">
                <div>
                    <h2 className="text-2xl font-bold">Game Servers</h2>
                    <p className="text-muted-foreground">
                        Host a game server
                    </p>
                </div>
                <Link href={`/dashboard/services/game/new`} className={buttonVariants()}>
                    <PlusCircle className="size-5" />
                    New Server
                </Link>
            </div>
            <Separator className="my-4" />
            <Suspense fallback={<LoadingSpinner />}>
                <GameServiceSuspense />
            </Suspense>
        </SidebarLayout>
    )
}

export default GameServicePage