
///////
///////

const EMBED_VERSION = '0.0.1';

export type HandwrittenEmbedData = {
	embedVersion: string;
	filepath: string;
	transcript: string;
};


// Primary functions
///////

export const buildEmbed = (filepath: string, transcript: string = '') => {
	let embedContent: HandwrittenEmbedData = {
		embedVersion: EMBED_VERSION,
		filepath,
		transcript,
	}

	let embedStr = "";
    embedStr += "\n```handwritten-ink";
    embedStr += "\n" + JSON.stringify(embedContent, null, '\t');
    embedStr += "\n```";

	return embedStr;
};

