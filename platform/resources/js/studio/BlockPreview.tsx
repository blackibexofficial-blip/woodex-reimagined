import type { CSSProperties } from 'react';
import { blocks, summarise } from './registry';

/**
 * What a block looks like inside the editor.
 *
 * A wireframe, not a rendering. The published page is rendered by Blade from the same props,
 * and mirroring eight Blade views as React components would mean maintaining two
 * implementations of every block — the copy that drifts is always the one nobody is looking at.
 * So the editor shows the block's shape, its settings and a link to the real page, and the
 * server remains the only renderer.
 *
 * The cost is honest: you cannot see the typography until you open the page. The benefit is
 * that there is exactly one definition of what a hero looks like.
 */

interface PreviewProps {
  name: string;
  props: Record<string, unknown>;
}

const card: CSSProperties = {
  border: '1px dashed #cfd4dc',
  borderRadius: 10,
  padding: '16px 18px',
  background: '#fbfaf7',
  minHeight: 96,
};

const label: CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  color: '#8a7f6d',
};

const title: CSSProperties = {
  margin: '6px 0 4px',
  fontFamily: 'Georgia, serif',
  fontSize: 20,
  color: '#1f2a37',
};

const detail: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: '#5b6472',
};

const badge: CSSProperties = {
  display: 'inline-block',
  marginTop: 10,
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 999,
  background: '#efe7d8',
  color: '#6b5a3e',
};

export function BlockPreview({ name, props }: PreviewProps) {
  const block = blocks[name];

  if (!block) {
    return <div style={card}>This build does not know the block “{name}”.</div>;
  }

  const summary = summarise(name, props);

  return (
    <div style={card}>
      <span style={label}>
        {block.group} · {block.label}
      </span>
      <h3 style={title}>{(props.heading as string) || block.label}</h3>
      {summary ? <p style={detail}>{summary}</p> : null}
      {block.bind ? (
        <span style={badge}>Live data — filled from the catalogue when the page is served</span>
      ) : null}
    </div>
  );
}
