import React from 'react';
import { render } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { WritingEditorWrapper } from 'src/components/formats/current/writing/writing-editor/writing-editor';

const makeTFile = (): any => ({ path: 'path/to/file' });

describe('WritingEditorWrapper (legacy)', () => {
  it('mounts wrapper without crashing when editorActive is default false', () => {
    render(
      <JotaiProvider>
        <WritingEditorWrapper
          plugin={{} as any}
          workspaceLeafId="test-leaf"
          embedId="test-embed"
          onResize={() => {}}
          writingFile={makeTFile()}
          save={() => {}}
          embedded
        />
      </JotaiProvider>
    );

    expect(true).toBe(true);
  });
});
