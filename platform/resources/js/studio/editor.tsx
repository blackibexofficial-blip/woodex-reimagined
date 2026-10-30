import { createRoot } from 'react-dom/client';
import { Puck } from '@puckeditor/core';
import '@puckeditor/core/puck.css';
import { useState } from 'react';
import { buildConfig } from './config';

/**
 * The studio entry point.
 *
 * Reads its configuration from the element Livewire rendered, mounts Puck over the stored
 * document, and posts the whole document on save. No per-keystroke traffic: on a shared host, a
 * builder that syncs continuously is a builder that times out mid-sentence.
 *
 * Two save paths, because they are genuinely different decisions:
 *
 *  - **Save draft** keeps the page unpublished (or leaves a published page live).
 *  - **Publish** moves it to `published` and stamps `published_at`. Needs `website.publish`.
 *
 * A 409 means someone else saved this page first. The message says so and the version is
 * refreshed, so the next save is deliberate rather than a silent overwrite.
 */

interface PuckData {
  root: { props: Record<string, unknown> };
  content: Array<{ type: string; props: Record<string, unknown> }>;
}

interface SaveResult {
  saved?: boolean;
  version?: number;
  status?: string;
  url?: string;
  preview_url?: string;
  blocks?: number;
  message?: string;
  errors?: string[];
}

const element = document.getElementById('puck-studio');

if (element) {
  const { pageTitle, document: raw, saveUrl, csrf, version: initialVersion, canPublish, previewUrl } = element.dataset;

  let latest: PuckData = raw ? (JSON.parse(raw) as PuckData) : { root: { props: {} }, content: [] };
  let version = Number(initialVersion ?? '1');

  const Studio = () => {
    const [state, setState] = useState<{ busy: boolean; tone: 'idle' | 'ok' | 'error'; message: string }>({
      busy: false,
      tone: 'idle',
      message: '',
    });

    const save = async (publish: boolean) => {
      // Puck always renders its Publish button. Refusing here — rather than hiding the button —
      // keeps the editor identical for everyone and puts the reason where the click happened.
      if (publish && canPublish !== '1') {
        setState({ busy: false, tone: 'error', message: 'You can edit this page but not publish it.' });

        return;
      }

      setState({ busy: true, tone: 'idle', message: publish ? 'Publishing…' : 'Saving…' });

      try {
        const response = await fetch(saveUrl ?? '', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-CSRF-TOKEN': csrf ?? '',
          },
          body: JSON.stringify({
            document: { root: latest.root, content: latest.content },
            publish,
            version,
          }),
        });

        const payload = (await response.json()) as SaveResult;

        if (!response.ok) {
          setState({
            busy: false,
            tone: 'error',
            message: [payload.message, ...(payload.errors ?? [])].filter(Boolean).join(' ') || 'The page was not saved.',
          });

          if (typeof payload.version === 'number') {
            version = payload.version;
          }

          return;
        }

        version = payload.version ?? version;
        setState({
          busy: false,
          tone: 'ok',
          message: `${publish ? 'Published' : 'Saved'} · ${payload.blocks ?? 0} blocks · version ${version}`,
        });
      } catch {
        setState({ busy: false, tone: 'error', message: 'Could not reach the server. Your changes are still in this tab.' });
      }
    };

    const tone =
      state.tone === 'error'
        ? 'border-red-300 bg-red-50 text-red-800'
        : state.tone === 'ok'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
          : 'border-gray-200 bg-gray-50 text-gray-600';

    return (
      <div>
        <div className={`mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2 text-sm ${tone}`}>
          <span>{state.message || 'Changes stay in this tab until you save.'}</span>
          <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="underline">
            Open the live page
          </a>
        </div>

        <Puck
          config={buildConfig(pageTitle ?? '')}
          data={latest as never}
          onChange={(data) => {
            latest = data as unknown as PuckData;
          }}
          onPublish={() => save(true)}
          overrides={{
            headerActions: () => (
              <button
                type="button"
                disabled={state.busy}
                onClick={() => save(false)}
                className="h-9 rounded-md border border-gray-300 px-3 text-sm disabled:opacity-50"
              >
                Save draft
              </button>
            ),
          }}
        />
      </div>
    );
  };

  createRoot(element).render(<Studio />);
}
