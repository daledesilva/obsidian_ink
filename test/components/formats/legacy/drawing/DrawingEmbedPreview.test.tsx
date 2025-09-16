import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { DrawingEmbedPreviewWrapper } from 'src/components/formats/current/drawing/drawing-embed-preview/drawing-embed-preview';

// Minimal InkPlugin and TFile stubs
const makePlugin = (overrides: Partial<any> = {}) => ({
  settings: {
    drawingFrameWhenLocked: true,
    drawingBackgroundWhenLocked: true,
  },
  app: { 
    vault: { 
      getResourcePath: jest.fn(() => 'data:image/svg+xml,%3Csvg/%3E'),
      on: jest.fn(() => jest.fn())
    } 
  },
  ...overrides,
});

const makeTFile = (): any => ({ 
  path: 'path/to/file',
  stat: { mtime: 1234567890 }
});

describe('DrawingEmbedPreview (legacy)', () => {
  it('renders wrapper and applies class names', () => {
    render(
      <JotaiProvider>
        <DrawingEmbedPreviewWrapper
          embeddedFile={makeTFile()}
          embedSettings={{}}
          onReady={() => {}}
          onClick={() => {}}
        />
      </JotaiProvider>
    );

    // The preview root div should exist with preview class
    const preview = document.querySelector('.ddc_ink_drawing-embed-preview');
    expect(preview).toBeInTheDocument();
  });
});


