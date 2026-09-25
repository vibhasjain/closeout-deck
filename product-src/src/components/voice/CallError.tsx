export function CallError({ error, errorKind, onRetry, onKeepTyping }: { error: string; errorKind?: 'call' | 'save'; onRetry(): void; onKeepTyping(): void }) {
  return <div className="call-error" role="alert">
    <p>{error}</p>
    <div className="call-error-actions"><button type="button" className="call-retry" onClick={onRetry}>{errorKind === 'save' ? 'Retry saving' : 'Retry the call'}</button><button type="button" className="call-keep-typing" onClick={onKeepTyping}>Keep typing</button></div>
  </div>
}
