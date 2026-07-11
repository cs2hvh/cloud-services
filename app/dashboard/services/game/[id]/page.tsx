import GameServerDetail from "@/components/dashboard/game/server-detail";

export const dynamic = "force-dynamic";

export default async function GameServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const serverId = Number(id);

  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
          style={{ background: "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)" }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>
      <div className="relative z-10 px-6 py-7 sm:px-10 sm:py-9">
        <GameServerDetail serverId={serverId} />
      </div>
    </div>
  );
}
