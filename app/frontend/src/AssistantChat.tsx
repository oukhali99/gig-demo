import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  postAssistantChat,
  type AssistantChatMessage,
  type AssistantPurpose,
} from './api';

export type AssistantApplyAction = { label: string; onApply: (text: string) => void };

type SuggestionChip = { label: string; prompt: string };

type Props = {
  purpose: AssistantPurpose;
  context: Record<string, unknown>;
  title?: string;
  /** Shown under the title in the panel header. */
  subtitle?: string;
  applyActions?: AssistantApplyAction[];
  /** Optional quick-start prompts; defaults by `purpose`. */
  suggestions?: SuggestionChip[];
};

const NARROW_QUERY = '(max-width: 640px)';

function subscribeNarrow(cb: () => void) {
  const mq = window.matchMedia(NARROW_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

function getNarrowSnapshot() {
  return window.matchMedia(NARROW_QUERY).matches;
}

function useNarrowViewport() {
  return useSyncExternalStore(subscribeNarrow, getNarrowSnapshot, () => false);
}

function defaultSuggestions(purpose: AssistantPurpose): SuggestionChip[] {
  if (purpose === 'job_draft') {
    return [
      { label: 'Suggest a title', prompt: 'Suggest a concise job title. Use my form context; ask a short clarifying question if needed.' },
      { label: 'Improve description', prompt: 'Improve my job description for clarity and professionalism using the details I already entered.' },
      { label: 'What am I missing?', prompt: 'What key details should I add so workers know scope, timing, and expectations?' },
    ];
  }
  return [
    { label: 'Draft my bio', prompt: 'Help me write a short trustworthy profile bio. Ask 1–2 clarifying questions if needed.' },
    { label: 'Sound more professional', prompt: 'Rewrite my bio to sound professional but friendly, keeping it concise.' },
    { label: 'Highlight experience', prompt: 'Suggest how to highlight my relevant experience without oversharing.' },
  ];
}

/**
 * Docked writing assistant: FAB opens a portal-mounted panel (bottom-right on desktop,
 * near-full-width with backdrop on narrow viewports).
 */
export function AssistantChat({
  purpose,
  context,
  title = 'Writing assistant',
  subtitle = 'Draft and refine text. Nothing is saved until you submit the form.',
  applyActions,
  suggestions,
}: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAssistantContent, setLastAssistantContent] = useState<string | null>(null);

  const fabRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const narrow = useNarrowViewport();

  const chips = suggestions ?? defaultSuggestions(purpose);

  const close = useCallback(() => {
    setOpen(false);
    queueMicrotask(() => fabRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => composerRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, open, loading]);

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    const userMsg: AssistantChatMessage = { role: 'user', content: trimmed };
    const nextMessages = [...messages, userMsg];
    setInput('');
    setLoading(true);
    setError(null);
    try {
      const res = await postAssistantChat({
        purpose,
        messages: nextMessages,
        context,
      });
      setMessages([...nextMessages, res.message]);
      setLastAssistantContent(res.message.content);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const onInsertChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const raw = e.target.value;
    e.target.value = '';
    if (raw === '' || lastAssistantContent == null || !applyActions?.length) return;
    const idx = Number(raw);
    if (!Number.isInteger(idx) || idx < 0 || idx >= applyActions.length) return;
    applyActions[idx].onApply(lastAssistantContent);
  };

  const shell = (
    <>
      {open && narrow && (
        <div className="assistant-backdrop" aria-hidden onClick={close} />
      )}
      {!open && (
        <button
          ref={fabRef}
          type="button"
          className="assistant-fab"
          onClick={() => setOpen(true)}
          aria-label={`Open ${title}`}
          aria-haspopup="dialog"
        >
          <span className="assistant-fab-icon" aria-hidden>
            ✦
          </span>
          <span className="assistant-fab-label">Writing help</span>
        </button>
      )}
      {open && (
        <div
          className="assistant-panel"
          role="dialog"
          aria-modal={narrow ? true : undefined}
          aria-labelledby="assistant-panel-title"
          aria-describedby="assistant-panel-desc"
        >
          <header className="assistant-panel-header">
            <div className="assistant-panel-header-text">
              <h2 id="assistant-panel-title" className="assistant-panel-title">
                {title}
              </h2>
              <p id="assistant-panel-desc" className="assistant-panel-subtitle">
                {subtitle}
              </p>
            </div>
            <button type="button" className="assistant-panel-close secondary" onClick={close} aria-label="Close">
              ×
            </button>
          </header>

          <div className="assistant-messages">
            {messages.length === 0 && (
              <div className="assistant-empty">
                <p className="assistant-empty-copy">Ask for help drafting or improving your text.</p>
                <div className="assistant-chips" role="group" aria-label="Suggested prompts">
                  {chips.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      className="assistant-chip"
                      onClick={() => setInput(c.prompt)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === 'user' ? 'assistant-row assistant-row-user' : 'assistant-row assistant-row-assistant'}
              >
                <div className={m.role === 'user' ? 'assistant-bubble-user' : 'assistant-bubble-assistant'}>
                  <span className="assistant-bubble-meta">{m.role === 'user' ? 'You' : 'Assistant'}</span>
                  <div className="assistant-bubble-body">{m.content}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="assistant-row assistant-row-assistant">
                <div className="assistant-bubble-assistant assistant-bubble-thinking">
                  <span className="assistant-bubble-meta">Assistant</span>
                  <div className="assistant-thinking">Thinking…</div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {error && <p className="assistant-error error">{error}</p>}

          {lastAssistantContent && applyActions && applyActions.length > 0 && (
            <div className="assistant-apply-row">
              <label htmlFor="assistant-insert-select" className="assistant-apply-label">
                Use last reply
              </label>
              <select
                id="assistant-insert-select"
                className="assistant-apply-select"
                defaultValue=""
                onChange={onInsertChange}
              >
                <option value="">Choose where to insert…</option>
                {applyActions.map((a, i) => (
                  <option key={a.label} value={String(i)}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <footer className="assistant-composer">
            <textarea
              ref={composerRef}
              id="assistant-composer-input"
              className="assistant-composer-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message the assistant…"
              rows={2}
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button type="button" className="assistant-send" disabled={loading || !input.trim()} onClick={() => void send()}>
              {loading ? 'Sending…' : 'Send'}
            </button>
          </footer>
        </div>
      )}
    </>
  );

  return createPortal(shell, document.body);
}
