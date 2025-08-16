import React from 'react';
import { render } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { TldrawWritingEditorWrapper } from 'src/components/formats/current/writing/tldraw-writing-editor/tldraw-writing-editor';

const makeTFile = (): any => ({ path: 'path/to/file' });

describe('TldrawWritingEditorWrapper (v1)', () => {
  it('mounts wrapper without crashing when editorActive is default false', () => {
    render(
      <JotaiProvider>
        <TldrawWritingEditorWrapper
          plugin={{} as any}
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


