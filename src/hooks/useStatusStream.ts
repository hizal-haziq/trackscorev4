import {useEffect, useRef} from 'react';
import {apiUrl} from '../services/api';
import {isRecord} from '../types/api';

export function useStatusStream(token: string, onUpdate: () => void) {
  const callback = useRef(onUpdate);
  callback.current = onUpdate;
  useEffect(() => {
    // Native reconnect reuses this instance; onerror never opens another source.
    const source = new EventSource(`${apiUrl('status-stream')}?token=${encodeURIComponent(token)}`);
    const seen = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polling: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    source.onmessage = event => {
      let payload: unknown;
      try {payload = JSON.parse(event.data);} catch {return;}
      if (!isRecord(payload) || !(payload.status || payload.newStatus || payload.action || payload.type === 'status-change')) return;
      // Existing handlers sometimes replace the bus ID with a record ID.
      const id = event.lastEventId || (typeof payload.id === 'string' ? `${payload.id}:${payload.timestamp || ''}:${payload.newStatus || payload.status || ''}:${payload.action || payload.type || ''}` : '');
      if (id) {
        if (seen.has(id)) return;
        seen.add(id);
        if (seen.size > 50) seen.delete(seen.values().next().value!);
      }
      clearTimeout(timer);
      timer = setTimeout(() => {if (!closed) callback.current();}, 250);
    };
    source.onerror = () => {if (!closed && !polling) polling = setInterval(() => callback.current(), 30_000);};
    source.onopen = () => {clearInterval(polling); polling = undefined;};
    const close = () => {closed = true; source.close(); clearTimeout(timer); clearInterval(polling);};
    window.addEventListener('pagehide', close);
    return () => {close(); window.removeEventListener('pagehide', close);};
  }, [token]);
}
