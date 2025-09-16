import React from 'react';
import { render } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { DrawingEmbedPreviewWrapper } from 'src/components/formats/current/drawing/drawing-embed-preview/drawing-embed-preview';

const makeTFile = (): any => ({ 
  path: 'path/to/drawing.svg', 
  vault: { read: jest.fn() },
  stat: { mtime: 1234567890 }
});

describe('DrawingEmbedPreview', () => {
  it('renders preview root element when active', () => {
    render(
      <JotaiProvider>
        <DrawingEmbedPreviewWrapper
          embeddedFile={makeTFile()}
          embedSettings={{ viewBox: { x: 0, y: 0, width: 100, height: 100 } }}
          onReady={() => {}}
          onClick={() => {}}
        />
      </JotaiProvider>
    );

    const el = document.querySelector('.ddc_ink_drawing-embed-preview');
    expect(el).toBeInTheDocument();
  });
});


