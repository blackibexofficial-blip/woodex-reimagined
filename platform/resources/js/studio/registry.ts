/**
 * The editor's view of the block registry.
 *
 * `registry.json` is imported directly — not fetched, not regenerated — so the editor and the
 * server build their ideas of a block from the same bytes. Adding a block means adding one
 * entry to that file and one Blade view; neither side needs to be told about the other.
 *
 * Types are declared locally rather than imported from Puck so this module stays importable by
 * tests and tooling that do not have the editor installed.
 */

import registry from './registry.json';

export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'boolean';

export interface FieldDefinition {
  type: FieldType;
  label: string;
  default?: string | number | boolean;
  min?: number;
  max?: number;
  options?: string[];
}

export interface BlockDefinition {
  label: string;
  group: string;
  icon?: string;
  bind: boolean;
  description?: string;
  fields: Record<string, FieldDefinition>;
}

export const blocks = registry.blocks as unknown as Record<string, BlockDefinition>;

export const blockNames = Object.keys(blocks);

/** Blocks whose content comes from the database, not from what the editor typed. */
export const boundBlocks = blockNames.filter((name) => blocks[name].bind);

export function defaultsOf(name: string): Record<string, unknown> {
  const block = blocks[name];
  const props: Record<string, unknown> = {};

  if (!block) {
    return props;
  }

  for (const [field, definition] of Object.entries(block.fields)) {
    props[field] = definition.default ?? (definition.type === 'number' ? 0 : '');
  }

  return props;
}

/** A one-line summary of what a block has been set to, shown in the editor's preview card. */
export function summarise(name: string, props: Record<string, unknown>): string {
  const block = blocks[name];

  if (!block) {
    return '';
  }

  const parts: string[] = [];

  for (const [field, definition] of Object.entries(block.fields)) {
    const value = props[field];

    if (value === undefined || value === '' || value === null) {
      continue;
    }

    if (definition.type === 'boolean' && (value === false || value === 'false')) {
      continue;
    }

    parts.push(`${definition.label}: ${String(value)}`);

    if (parts.length === 3) {
      break;
    }
  }

  return parts.join(' · ');
}
