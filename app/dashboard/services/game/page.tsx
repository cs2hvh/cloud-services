import { GameServers } from "@/lib/supabase/queries";
import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import GameServerGrid from "@/components/dashboard/projects/tabs/resources/grid";
import { Separator } from "@/components/ui/separator";
import { getUser } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import { ErrorMessage } from "@/components/dashboard/utils/error";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";

const GameServiceSuspense = async () => {
  const user = await getUser();

  if (!user) {
    notFound();
  }

  const gameservers = await GameServers.get_by_user(user.id);

  if (!gameservers) {
    return (
      <ErrorMessage message="Unable to load game servers. Please try again later." />
    );
  }

  return <GameServerGrid data={gameservers} />;
};

const GameServicePage = () => {
  return (
    <div className="flex-1 bg-black min-h-screen">
      <div className="px-6 py-4">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">Game Servers</h2>
            <p className="text-gray-400">Host and manage your game servers</p>
          </div>
          <Link
            href={`/dashboard/services/game/new`}
            className={buttonVariants({ className: "bg-blue-600 hover:bg-blue-700 text-white" })}
          >
            <PlusCircle className="size-5 mr-2" />
            New Server
          </Link>
        </div>
        <div className="border-t border-gray-800 pt-8">
          <Suspense fallback={
            <div className="flex items-center justify-center py-20">
              <LoadingSpinner />
            </div>
          }>
            <GameServiceSuspense />
          </Suspense>
        </div>
      </div>
    </div>
  );
};

export default GameServicePage;
