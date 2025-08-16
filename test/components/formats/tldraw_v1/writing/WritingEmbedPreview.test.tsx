import React from 'react';
import { render } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { WritingEmbedPreviewWrapper } from 'src/components/formats/tldraw_v1/writing/writing-embed-preview/writing-embed-preview';

const makePlugin = (overrides: Partial<any> = {}) => ({
  settings: {
    writingLinesWhenLocked: true,
    writingBackgroundWhenLocked: true,
  },
  ...overrides,
});

const makeTFile = (): any => ({ path: 'path/to/file' });

describe('WritingEmbedPreview (v1)', () => {
  it('renders wrapper root element', () => {
    render(
      <JotaiProvider>
        <WritingEmbedPreviewWrapper
          plugin={makePlugin() as any}
          onResize={() => {}}
          writingFile={makeTFile()}
          onClick={() => {}}
        />
      </JotaiProvider>
    );

    const el = document.querySelector('.ddc_ink_writing-embed-preview');
    expect(el).toBeInTheDocument();
  });
});


