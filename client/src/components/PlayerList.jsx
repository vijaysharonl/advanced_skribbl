export default function PlayerList({ players, drawer }) {
  if (!players?.length) return null;

  const sorted = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="p-3 bg-gray-800 text-white">
      <h2 className="text-green-400 font-bold mb-2 text-lg">Players</h2>
      <ul className="space-y-2">
        {sorted.map((p, i) => (
          <li
            key={p.name}
            className={`flex items-center justify-between px-3 py-2 rounded-lg ${
              p.name === drawer ? "bg-yellow-600/40" : "bg-gray-700/50"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-semibold ${
                  i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : "text-amber-200"
                }`}
              >
                #{i + 1}
              </span>
              <span className="font-medium">
                {p.name} {p.name === drawer && "✏️"}
              </span>
            </div>
            <span className="text-green-400 font-semibold">{p.score}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
