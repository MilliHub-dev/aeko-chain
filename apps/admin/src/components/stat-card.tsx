export default function StatCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string
  value: string | number
  sub?: string
  accent?: boolean
}) {
  return (
    <div className="bg-[#12141f] border border-[#1e2135] rounded-xl p-5">
      <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">{label}</div>
      <div className={`text-2xl font-bold mono truncate ${accent ? 'text-emerald-400' : 'text-white'}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-gray-500 mt-1 truncate">{sub}</div>}
    </div>
  )
}
