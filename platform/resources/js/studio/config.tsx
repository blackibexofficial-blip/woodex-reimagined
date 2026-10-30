import type { ReactNode } from 'react';
import type { ComponentConfig, Config, Field } from '@puckeditor/core';
import { BlockPreview } from './BlockPreview';
import { blocks, defaultsOf } from './registry';
import type { FieldDefinition } from './registry';

/**
 * Builds the Puck configuration from `registry.json`.
 *
 * Nothing here knows what a hero is. Every block, every field, its label, its default and its
 * range come from the JSON; this file only knows how to translate a registry field into a Puck
 * field. That is what keeps the editor from becoming the second place where blocks are defined.
 */

/** Registry field type → Puck field. Numbers stay numbers so the server can clamp them. */
function toPuckField(definition: FieldDefinition): Field {
  switch (definition.type) {
    case 'textarea':
      return { type: 'textarea', label: definition.label };

    case 'number':
      return {
        type: 'number',
        label: definition.label,
        min: definition.min,
        max: definition.max,
      };

    case 'boolean':
      // A select rather than a radio: Puck stores the value as a string, and the server's
      // normaliser already reads 'true'/'false' as booleans. One fewer type to get wrong.
      return {
        type: 'select',
        label: definition.label,
        options: [
          { label: 'Yes', value: 'true' },
          { label: 'No', value: 'false' },
        ],
      };

    case 'select':
      return {
        type: 'select',
        label: definition.label,
        options: (definition.options ?? []).map((option) => ({ label: option, value: option })),
      };

    default:
      return { type: 'text', label: definition.label };
  }
}

export function buildConfig(pageTitle: string): Config {
  const components: Record<string, ComponentConfig> = {};

  for (const [name, block] of Object.entries(blocks)) {
    const fields: Record<string, Field> = {};

    for (const [field, definition] of Object.entries(block.fields)) {
      fields[field] = toPuckField(definition);
    }

    components[name] = {
      label: block.label,
      fields,
      defaultProps: defaultsOf(name),
      render: (props: Record<string, unknown>) => <BlockPreview name={name} props={props} />,
    };
  }

  return {
    components,
    root: {
      fields: {
        title: { type: 'text', label: 'Page title' },
      },
      defaultProps: { title: pageTitle },
      render: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    },
  };
}
