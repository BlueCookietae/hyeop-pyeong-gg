export const revalidate = 3600;

export default async function PlayerPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const playerName = decodeURIComponent(name);
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="font-black text-cyan-400 text-2xl">{playerName}</div>
    </div>
  );
}
