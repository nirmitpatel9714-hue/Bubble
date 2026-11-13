import { useEffect, useState } from "react";

const TIME = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** The tuios-style status-bar clock: local time at minute precision. */
export function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span
      title={now.toLocaleDateString()}
      className="shrink-0 px-1 text-[11px] tabular-nums text-muted-foreground/80"
    >
      {TIME.format(now)}
    </span>
  );
}
