export function RequestState({loading, error, retry, hasData}: {loading: boolean; error: string | null; retry: () => void; hasData: boolean}) {
  if (error) return <div className="ts-request-error" role="alert"><p>{error}</p>{hasData && <p>Showing the last loaded overview. It may be out of date.</p>}<button className="ts-button ts-button-secondary" onClick={retry}>Try again</button></div>;
  if (loading) return <p role="status" className="ts-request-state">{hasData ? 'Updating overview…' : 'Loading overview…'}</p>;
  return null;
}
