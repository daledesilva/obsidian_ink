import React from 'react';
import { render } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { WritingEmbedPreviewWrapper } from 'src/components/formats/current/writing/writing-embed-preview/writing-embed-preview';

const makePlugin = () => ({ 
  settings: { writingLinesWhenLocked: true, writingBackgroundWhenLocked: true },
  app: { 
    vault: { 
      getResourcePath: jest.fn(() => 'data:image/svg+xml,%3Csvg/%3E'),
      on: jest.fn(() => jest.fn()),
      offref: jest.fn()
    } 
  }
});
const makeTFile = (): any => ({ 
  path: 'path/to/file',
  stat: { mtime: 1234567890 }
});

describe('WritingEmbedPreview', () => {
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


