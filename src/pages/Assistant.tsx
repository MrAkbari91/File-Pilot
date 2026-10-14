import { useState } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import type { AssistantIntent, SearchInput } from '../../shared/contracts';
import { api } from '../api';
import { useApp } from '../context';
import { PageHeading, Panel, SafetyNote } from '../components/ui';
export function Assistant({
  navigate,
  search,
}: {
  navigate: (page: string) => void;
  search: (filters: SearchInput) => void;
}) {
  const { busy, run } = useApp();
  const [text, setText] = useState('');
  const [intent, setIntent] = useState<AssistantIntent | null>(null);
  return (
    <>
      <PageHeading
        eyebrow="LOCAL ASSISTANT"
        title="Start with what you want to do."
        description="Plain-language shortcuts. Private by design."
      />
      <Panel>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api('assistant', { text })).then((value) => {
              if (value) setIntent(value);
            });
          }}
        >
          <div className="assistant-input">
            <Sparkles size={24} />
            <textarea
              aria-label="Tell the assistant what you want to do"
              maxLength={500}
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Show files larger than 500 MB"
            />
          </div>
          <div className="form-footer">
            <span className="muted grow">Deterministic local parser · No model download</span>
            <button className="primary" disabled={busy || !text.trim()}>
              Interpret request
              <ArrowRight size={17} />
            </button>
          </div>
        </form>
      </Panel>
      <div className="suggestions">
        {[
          'Find large videos',
          'Show PDFs modified last month',
          'Find files with invoice in their name',
          'Organize my Downloads folder by file type',
          'Find duplicate images',
          'Create a rule for new PDF files',
        ].map((example) => (
          <button key={example} onClick={() => setText(example)}>
            {example}
          </button>
        ))}
      </div>
      {intent && (
        <Panel title={intent.supported ? 'Here’s the next step' : 'Try a supported request'}>
          <div className="assistant-response">
            <p>{intent.explanation}</p>
            {intent.supported && (
              <button
                className="primary"
                onClick={() => {
                  if (intent.action === 'search') search(intent.filters);
                  else
                    navigate(
                      {
                        organize: 'Smart Organizer',
                        duplicates: 'Duplicate Center',
                        automation: 'Automation',
                      }[intent.action],
                    );
                }}
              >
                {intent.action === 'search' ? 'Run this search' : 'Choose folders & review'}
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </Panel>
      )}
      <SafetyNote>
        The assistant understands a small set of explicit patterns. It cannot execute shell commands
        or select folders for you. Unknown requests are rejected rather than guessed.
      </SafetyNote>
    </>
  );
}
