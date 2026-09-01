import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id?: string) => void;
    };
  }
}

type Props = {
  siteKey: string;
  onToken: (token: string | null) => void;
  theme?: "auto" | "light" | "dark";
};

const SCRIPT_ID = "cf-turnstile-script";

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      const wait = () => (window.turnstile ? resolve() : setTimeout(wait, 50));
      wait();
      return;
    }
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => {
      const wait = () => (window.turnstile ? resolve() : setTimeout(wait, 50));
      wait();
    };
    s.onerror = () => reject(new Error("falha ao carregar a verificação de segurança"));
    document.head.appendChild(s);
  });
}

export default function Turnstile({ siteKey, onToken, theme = "auto" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widgetId = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          theme,
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile?.remove) window.turnstile.remove(widgetId);
    };
  }, [siteKey, theme]);

  if (failed) {
    return (
      <div style={{ fontSize: 12, color: "#991b1b", background: "#fee2e2", padding: "8px 12px", borderRadius: 6 }}>
        Não foi possível carregar a verificação de segurança. Atualize a página e tente novamente.
      </div>
    );
  }

  return <div ref={ref} data-testid="turnstile-widget" style={{ minHeight: 65 }} />;
}