import { useEffect, useState, useRef } from "react";

export default function ChatBox({ socket, name, room }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const endRef = useRef(null);
  const scrollRef = useRef(null);

  // ✅ Listen for messages
  useEffect(() => {
    if (!socket) return;
    const handler = (msg) => setMessages((prev) => [...prev, msg].slice(-150));
    socket.on("chatMessage", handler);
    return () => socket.off("chatMessage", handler);
  }, [socket]);

  // ✅ Auto-scroll (only when near bottom)
  useEffect(() => {
    const chat = scrollRef.current;
    if (!chat) return;

    const isNearBottom =
      chat.scrollHeight - chat.scrollTop - chat.clientHeight < 150;

    if (isNearBottom) {
      chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  // ✅ Send message
  const sendMessage = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    socket.emit("chatMessage", { sender: name, text: input.trim(), room });
    setInput("");
  };

  return (
    <div className="flex flex-col h-full bg-gray-800">
      {/* 🧾 Scrollable message list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-sm 
                   scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800"
        style={{
          minHeight: 0,
          overscrollBehavior: "contain",
          scrollBehavior: "smooth",
        }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={`break-word ${
              m.sender === "SYSTEM"
                ? "text-green-400 font-semibold"
                : m.sender === name
                ? "text-blue-400"
                : "text-white"
            }`}
          >
            {m.sender !== "SYSTEM" && <strong>{m.sender}: </strong>}
            {m.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* ✏️ Input section (fixed at bottom) */}
      <form
        onSubmit={sendMessage}
        className="flex-none p-2 border-t border-gray-700 flex bg-gray-900"
      >
        <input
          className="flex-1 bg-gray-700 text-white p-2 rounded outline-none placeholder-gray-400"
          placeholder="Type your guess..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          className="ml-2 bg-green-500 hover:bg-green-400 text-black px-4 py-2 rounded font-semibold"
          type="submit"
        >
          Send
        </button>
      </form>
    </div>
  );
}
