import React from 'react';
import { render } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { WritingEmbedPreviewWrapper } from 'src/components/formats/current/writing/writing-embed-preview/writing-embed-preview';

const makePlugin = (overrides: Partial<any> = {}) => ({
  settings: {
    writingLinesWhenLocked: true,
    writingBackgroundWhenLocked: true,
  },
  ...overrides,
});

const makeTFile = (): any => ({ path: 'path/to/file' });

describe('WritingEmbedPreview (legacy)', () => {
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


