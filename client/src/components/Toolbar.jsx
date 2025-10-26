import { useEffect, useState } from "react";

export default function Toolbar({ socket, color, setColor, size, setSize, isDrawer }) {
  const [visible, setVisible] = useState(true);
  const colors = [
    "#ff0000", "#ff7f00", "#ffff00", "#00ff00",
    "#0000ff", "#4b0082", "#8f00ff", "#000000", "#ffffff",
  ];

  const clearBoard = () => {
    if (window.confirm("Clear the canvas for everyone?")) {
      socket.emit("clearCanvas");
    }
  };

  const undoStroke = () => socket.emit("triggerUndo");

  // Auto-hide after 3s
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    const handleActivity = () => setVisible(true);
    window.addEventListener("touchstart", handleActivity);
    window.addEventListener("mousemove", handleActivity);
    return () => {
      window.removeEventListener("touchstart", handleActivity);
      window.removeEventListener("mousemove", handleActivity);
    };
  }, []);

  if (!isDrawer) return null;

  return (
    <div
      className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 transition-all duration-500 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10 pointer-events-none"
      } bg-gray-800 p-3 rounded-xl shadow-lg flex flex-wrap justify-center gap-3 z-50 w-[95%] max-w-md border border-gray-700`}
    >
      {/* Colors */}
      <div className="flex gap-2 flex-wrap justify-center">
        {colors.map((c, i) => (
          <button
            key={i}
            className={`w-6 h-6 rounded-full border ${
              c === color ? "border-white scale-110" : "border-gray-500"
            } transition-transform`}
            style={{ backgroundColor: c }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>

      {/* Brush size */}
      <div className="flex items-center gap-2 ml-2">
        <input
          type="range"
          min="1"
          max="15"
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className="cursor-pointer accent-green-400"
        />
        <span className="text-white text-sm w-5 text-center">{size}</span>
      </div>

      {/* Undo + Clear */}
      <div className="flex gap-2 ml-2">
        <button
          onClick={undoStroke}
          className="bg-yellow-500 hover:bg-yellow-400 px-3 py-1 rounded text-black font-semibold"
        >
          Undo
        </button>
        <button
          onClick={clearBoard}
          className="bg-red-500 hover:bg-red-400 px-3 py-1 rounded text-white font-semibold"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
