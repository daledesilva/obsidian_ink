import React from 'react';
import { render } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { DrawingEmbed_v2 } from 'src/components/formats/tldraw_v2/drawing/drawing-embed/drawing-embed';

const makeEmbedSettings = () => ({ embedDisplay: { width: 400, aspectRatio: 1.6 }, viewBox: { x: 0, y: 0, width: 100, height: 100 } });

describe('DrawingEmbed (v2)', () => {
  it('shows not found message when embeddedFile is null', () => {
    render(
      <JotaiProvider>
        <DrawingEmbed_v2
          embeddedFile={null}
          embedSettings={makeEmbedSettings() as any}
          saveSrcFile={() => {}}
          remove={() => {}}
          partialEmbedFilepath={'missing.svg'}
        />
      </JotaiProvider>
    );

    expect(document.body.textContent).toContain('missing.svg');
  });
});


