
///////
///////

const EMBED_VERSION = '0.0.1';

type embedData = {
	embedVersion: string;
	filepath: string;
	transcript: string;
};


// Primary functions
///////

export const buildEmbed = (filepath: string, transcript: string = '') => {
	let embedContent: embedData = {
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

