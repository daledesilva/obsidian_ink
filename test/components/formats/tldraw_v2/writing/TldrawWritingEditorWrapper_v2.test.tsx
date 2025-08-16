import React from 'react';
import { render } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { TldrawWritingEditorWrapper } from 'src/components/formats/tldraw_v2/writing/tldraw-writing-editor/tldraw-writing-editor';

const makeTFile = (): any => ({ path: 'path/to/file', vault: { read: jest.fn().mockResolvedValue('<svg></svg>') } });

describe('TldrawWritingEditorWrapper (v2)', () => {
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


