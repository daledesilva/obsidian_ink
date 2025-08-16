import React from 'react';
import { render } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { WritingEmbedPreviewWrapper } from 'src/components/formats/tldraw_v2/writing/writing-embed-preview/writing-embed-preview';

const makePlugin = () => ({ settings: { writingLinesWhenLocked: true, writingBackgroundWhenLocked: true } });
const makeTFile = (): any => ({ path: 'path/to/file' });

describe('WritingEmbedPreview (v2)', () => {
  it('renders preview root', () => {
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


