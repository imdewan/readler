let _pendingText = '';
let _pendingTitle = '';

export function setPending(text: string, title?: string) {
  _pendingText = text;
  _pendingTitle = title ?? '';
}

export function consumePending(): string {
  const t = _pendingText;
  _pendingText = '';
  return t;
}

export function consumePendingTitle(): string {
  const t = _pendingTitle;
  _pendingTitle = '';
  return t;
}
