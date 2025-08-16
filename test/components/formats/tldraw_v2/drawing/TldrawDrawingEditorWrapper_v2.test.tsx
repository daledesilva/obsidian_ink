import React from 'react';
import { render } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { TldrawDrawingEditorWrapper } from 'src/components/formats/current/drawing/tldraw-drawing-editor/tldraw-drawing-editor';

const makeTFile = (): any => ({ path: 'path/to/file', vault: { read: jest.fn().mockResolvedValue('<svg></svg>') } });

describe('TldrawDrawingEditorWrapper (v2)', () => {
  it('mounts wrapper without crashing when editorActive is default false', () => {
    render(
      <JotaiProvider>
        <TldrawDrawingEditorWrapper
          onReady={() => {}}
          drawingFile={makeTFile()}
          save={() => {}}
        />
      </JotaiProvider>
    );

    expect(true).toBe(true);
  });
});


