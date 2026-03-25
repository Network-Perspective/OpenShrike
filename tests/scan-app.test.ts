import {describe, expect, it} from 'vitest';
import {buildStreamSections} from '../src/ui/scan-app.js';

describe('buildStreamSections', () => {
  it('splits the OpenCode stream into event, output, and reasoning panes', () => {
    const sections = buildStreamSections({
      entries: ['session busy', 'bash running'],
      output: 'assistant line 1\nassistant line 2',
      reasoning: 'reasoning line'
    });

    expect(sections.events.map(line => line.text)).toEqual(['session busy', 'bash running']);
    expect(sections.output.map(line => line.text)).toEqual(['assistant line 1', 'assistant line 2']);
    expect(sections.reasoning.map(line => line.text)).toEqual(['reasoning line']);
  });

  it('provides stable placeholder text when a pane has no content yet', () => {
    const sections = buildStreamSections({
      entries: [],
      output: '',
      reasoning: ''
    });

    expect(sections.events.map(line => line.text)).toEqual(['Waiting for OpenCode events...']);
    expect(sections.output.map(line => line.text)).toEqual(['(no assistant text yet)']);
    expect(sections.reasoning.map(line => line.text)).toEqual(['(no reasoning stream yet)']);
  });
});
