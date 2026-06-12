import { Check } from "lucide-react";

// Toast de confirmação reutilizado por todas as telas. Mostra um ícone de
// "check" (lucide) antes da mensagem — substitui o antigo "✓" textual.
export default function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      style={{
        position: "fixed", bottom: 24, right: 24,
        display: "flex", alignItems: "center", gap: 8,
        background: "#0f172a", color: "#fff",
        padding: "10px 18px", borderRadius: 10,
        fontSize: 13, fontWeight: 500, zIndex: 9999,
      }}
    >
      <Check size={16} strokeWidth={2.5} aria-hidden />
      <span>{message}</span>
    </div>
  );
}
