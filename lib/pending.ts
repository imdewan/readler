let _pendingText = '';

export function setPending(text: string) { _pendingText = text; }
export function consumePending(): string {
  const t = _pendingText;
  _pendingText = '';
  return t;
}
