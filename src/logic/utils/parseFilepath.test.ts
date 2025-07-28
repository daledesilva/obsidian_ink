import { describe, expect, test } from "@jest/globals";
import { parseFilepath } from "./parseFilepath";

////////////
////////////

describe(`parseFilepath tests`, () => {

    test(`file.md`, () => {
        const result = parseFilepath(`file.md`);
        expect(result).toEqual({
            folderpath: '',
            basename: 'file',
            ext: 'md'
        });
    })

    test(`folder/file.md`, () => {
        const result = parseFilepath(`folder/file.md`);
        expect(result).toEqual({
            folderpath: 'folder',
            basename: 'file',
            ext: 'md'
        });
    })

    test(`folder1/folder2/file.md`, () => {
        const result = parseFilepath(`folder1/folder2/file.md`);
        expect(result).toEqual({
            folderpath: 'folder1/folder2',
            basename: 'file',
            ext: 'md'
        });
    })

    test(`/file.md`, () => {
        const result = parseFilepath(`/file.md`);
        expect(result).toEqual({
            folderpath: '',
            basename: 'file',
            ext: 'md'
        });
    })

    test(`1920.12.01.md`, () => {
        const result = parseFilepath(`1920.12.01.md`);
        expect(result).toEqual({
            folderpath: '',
            basename: '1920.12.01',
            ext: 'md'
        });
    })

    test(`folder1/folder2/1920.12.01.md`, () => {
        const result = parseFilepath(`folder1/folder2/1920.12.01.md`);
        expect(result).toEqual({
            folderpath: 'folder1/folder2',
            basename: '1920.12.01',
            ext: 'md'
        });
    })

});
