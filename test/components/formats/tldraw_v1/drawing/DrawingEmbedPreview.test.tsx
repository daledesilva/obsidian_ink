import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { DrawingEmbedPreviewWrapper } from 'src/components/formats/tldraw_v1/drawing/drawing-embed-preview/drawing-embed-preview';

// Minimal InkPlugin and TFile stubs
const makePlugin = (overrides: Partial<any> = {}) => ({
  settings: {
    drawingFrameWhenLocked: true,
    drawingBackgroundWhenLocked: true,
  },
  ...overrides,
});

const makeTFile = (): any => ({ path: 'path/to/file' });

describe('DrawingEmbedPreview (v1)', () => {
  it('renders wrapper and applies class names', () => {
    render(
      <JotaiProvider>
        <DrawingEmbedPreviewWrapper
          plugin={makePlugin() as any}
          onReady={() => {}}
          drawingFile={makeTFile()}
          onClick={() => {}}
        />
      </JotaiProvider>
    );

    // The preview root div should exist with preview class
    const preview = document.querySelector('.ddc_ink_drawing-embed-preview');
    expect(preview).toBeInTheDocument();
  });
});


