

export function parseFilepath(filepath: string): { folderpath: string; basename: string; ext: string; } {
    const segments = filepath.split('/');

    // Handle root directory (/)
    let folderpath = segments[0] === '' ? '/' : '';

    // Extract filename and extension
    const filename = segments.pop() || '';
    const extIndex = filename.lastIndexOf('.');
    const ext = extIndex >= 0 ? filename.slice(extIndex) : '';
    const basename = extIndex >= 0 ? filename.slice(0, extIndex) : filename;

    folderpath = segments.join('/');

    return { folderpath, basename, ext: ext.startsWith('.') ? ext.slice(1) : ext };
}
