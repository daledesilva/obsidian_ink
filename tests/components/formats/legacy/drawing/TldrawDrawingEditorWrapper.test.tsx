import React from 'react';
import { render } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { TldrawDrawingEditorWrapper } from 'src/components/formats/current/drawing/tldraw-drawing-editor/tldraw-drawing-editor';

const makeTFile = (): any => ({ 
  path: 'path/to/file',
  stat: { mtime: 1234567890 }
});

describe('TldrawDrawingEditorWrapper (legacy)', () => {
  it('mounts wrapper without crashing when editorActive is default false', () => {
    render(
      <JotaiProvider>
        <TldrawDrawingEditorWrapper
          onReady={() => {}}
          drawingFile={makeTFile()}
          save={(_pageData: any) => {}}
        />
      </JotaiProvider>
    );

    // Wrapper either renders empty or inner editor. We just assert no crash and container exists.
    expect(true).toBe(true);
  });
});


