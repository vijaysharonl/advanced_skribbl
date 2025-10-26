import { useEffect } from "react";

export default function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className="fixed top-4 right-4 bg-gray-800 border border-green-400 text-white px-4 py-2 rounded-lg shadow-lg animate-fade-in">
      {message}
    </div>
  );
}
