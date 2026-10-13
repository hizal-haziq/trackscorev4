import { useEffect, useRef, useState } from 'react';

interface VendorStatusEvent {
  id?: string;
  evaluationId?: string;
  companyName?: string;
  deviceModel?: string;
  status?: string;
  newStatus?: string;
  note?: string;
  timestamp?: string;
  slaDeadline?: string;
  slaStatus?: string;
}

interface UseVendorStatusStreamOptions {
  token: string | null;
  onUpdate: (event: VendorStatusEvent) => void;
}

export function useVendorStatusStream({ token, onUpdate }: UseVendorStatusStreamOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!token) {
      setIsConnected(false);
      return;
    }

    let isClosed = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingEvent: VendorStatusEvent | null = null;

    const streamUrl = `/.netlify/functions/status-stream?token=${encodeURIComponent(token)}`;
    const eventSource = new EventSource(streamUrl);

    eventSource.onopen = () => {
      if (!isClosed) setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      if (isClosed) return;
      try {
        const data: VendorStatusEvent = JSON.parse(event.data);
        if (data && (data.newStatus || data.status)) {
          if (!pendingEvent || (data.timestamp && (!pendingEvent.timestamp || Date.parse(data.timestamp) >= Date.parse(pendingEvent.timestamp)))) {
            pendingEvent = data;
          }
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => {
            refreshTimer = null;
            if (pendingEvent && !isClosed) {
              const latest = pendingEvent;
              pendingEvent = null;
              onUpdateRef.current(latest);
            }
          }, 250);
        }
      } catch {
        // Ignore non-JSON heartbeat messages
      }
    };

    eventSource.onerror = () => {
      if (!isClosed) setIsConnected(false);
    };

    return () => {
      isClosed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      eventSource.close();
      setIsConnected(false);
    };
  }, [token]);

  return { isConnected };
}
