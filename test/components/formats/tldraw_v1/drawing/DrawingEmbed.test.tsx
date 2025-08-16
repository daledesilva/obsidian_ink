import React from 'react';
import { render } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import DrawingEmbed from 'src/components/formats/tldraw_v1/drawing/drawing-embed-editor/drawing-embed';

const makePlugin = (overrides: Partial<any> = {}) => ({
  app: { vault: {} },
  settings: {},
  ...overrides,
});

const makeTFile = (): any => ({ path: 'path/to/file' });

describe('DrawingEmbed (v1)', () => {
  it('renders container and children', () => {
    render(
      <JotaiProvider>
        <DrawingEmbed
          plugin={makePlugin() as any}
          drawingFileRef={makeTFile()}
          pageData={{} as any}
          saveSrcFile={() => {}}
          setEmbedProps={() => {}}
          remove={() => {}}
        />
      </JotaiProvider>
    );

    const container = document.querySelector('.ddc_ink_drawing-embed');
    expect(container).toBeInTheDocument();
  });
});


