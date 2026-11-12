// New thread on its own row, under the sidebar header that holds the space
// switcher. bb's header slot is a single fixed-height row and has no slot
// between the header and the thread list, so we portal a row into the
// sidebar body right after the header. If bb's markup changes and the anchor
// is gone, the button falls back into the header next to the switcher.
import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { RailNewThreadButton } from "./nav/Rail.js";

const HEADER_ROW = '[data-testid="app-sidebar-top-reserve-row"]';
const ROW_ATTR = "data-spaces-new-thread-row";

export function useNewThreadRowHost(): HTMLElement | null {
  const scope = usePortalScopeProps();
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const header = document.querySelector<HTMLElement>(HEADER_ROW);
    const body = header?.parentElement;
    if (!header || !body) return;
    const row = document.createElement("div");
    row.setAttribute(ROW_ATTR, "");
    for (const [name, value] of Object.entries(scope)) {
      if (value !== undefined) row.setAttribute(name, value);
    }
    row.className = "flex shrink-0 items-center px-2 pb-1";
    body.insertBefore(row, header.nextSibling);
    setHost(row);
    return () => {
      row.remove();
      setHost(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return host;
}

export function NewThreadRow({ host }: { host: HTMLElement }) {
  return createPortal(
    <div className="flex min-w-0 flex-1">
      <RailNewThreadButton />
    </div>,
    host,
  );
}
