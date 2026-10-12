import {useCallback, useEffect, useRef, useState} from 'react';

export function useApi<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{data: T | null; loading: boolean; error: string | null; updatedAt: number | null}>({data: null, loading: true, error: null, updatedAt: null});
  const sequence = useRef(0);
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    const request = ++sequence.current;
    setState(previous => ({...previous, loading: true, error: null}));
    Promise.resolve().then(() => {controller.signal.throwIfAborted(); return load(controller.signal);}).then(data => {
      if (!controller.signal.aborted && sequence.current === request) setState({data, loading: false, error: null, updatedAt: Date.now()});
    }).catch(error => {
      if (!controller.signal.aborted && sequence.current === request) setState(previous => ({...previous, loading: false, error: error instanceof Error ? error.message : 'The overview could not be loaded.'}));
    });
    return () => controller.abort();
  }, [load, revision]);
  return {...state, refresh};
}
