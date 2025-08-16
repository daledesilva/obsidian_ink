import React from 'react';
import { render } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { TldrawDrawingEditorWrapper_v2 } from 'src/components/formats/tldraw_v2/drawing/tldraw-drawing-editor/tldraw-drawing-editor';

const makeTFile = (): any => ({ path: 'path/to/file', vault: { read: jest.fn().mockResolvedValue('<svg></svg>') } });

describe('TldrawDrawingEditorWrapper (v2)', () => {
  it('mounts wrapper without crashing when editorActive is default false', () => {
    render(
      <JotaiProvider>
        <TldrawDrawingEditorWrapper_v2
          onReady={() => {}}
          drawingFile={makeTFile()}
          save={() => {}}
        />
      </JotaiProvider>
    );

    expect(true).toBe(true);
  });
});


