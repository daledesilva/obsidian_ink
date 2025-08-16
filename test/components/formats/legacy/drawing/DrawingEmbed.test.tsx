import React from 'react';
import { render } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import DrawingEmbed from 'src/components/formats/current/drawing/drawing-embed/drawing-embed';
import { DEFAULT_EMBED_SETTINGS } from 'src/types/embed-settings';

const makePlugin = (overrides: Partial<any> = {}) => ({
  app: { vault: {} },
  settings: {},
  ...overrides,
});

const makeTFile = (): any => ({ path: 'path/to/file' });

describe('DrawingEmbed (legacy)', () => {
  it('renders container and children', () => {
    render(
      <JotaiProvider>
        <DrawingEmbed
          embeddedFile={makeTFile()}
          embedSettings={DEFAULT_EMBED_SETTINGS}
          saveSrcFile={() => {}}
          remove={() => {}}
          partialEmbedFilepath="test-drawing.svg"
        />
      </JotaiProvider>
    );

    const container = document.querySelector('.ddc_ink_drawing-embed');
    expect(container).toBeInTheDocument();
  });
});


