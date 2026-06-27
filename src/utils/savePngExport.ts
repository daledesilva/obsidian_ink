import { TFile } from "obsidian";
import InkPlugin from "src/main";
import { getPreviewFileVaultPath } from "./getPreviewFileVaultPath";

export const savePngExport = async (plugin: InkPlugin, dataUri: string, fileRef: TFile): Promise<void> => {
  const v = plugin.app.vault;

  // Convert data URI directly to ArrayBuffer (avoids Node Buffer dependency)
  const arrayBuffer = await (await fetch(dataUri)).arrayBuffer();

  const previewFilepath = getPreviewFileVaultPath(plugin, fileRef); // REVIEW: This should probably be moved out of this function
  const abstractFile = v.getAbstractFileByPath(previewFilepath);

  if (abstractFile instanceof TFile) {
    await v.modifyBinary(abstractFile, arrayBuffer);
  } else {
    await v.createBinary(previewFilepath, arrayBuffer);
  }
};
