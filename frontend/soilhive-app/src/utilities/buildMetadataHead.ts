// TODO: make these properties configurable by environment variables or server configuration. To be discussed.
const DESCRIPTION =
  'Explore, compare, and download soil data from multiple sources. SoilHive is an open platform designed to bridge global soil information gaps through collaboration.';
const SITE_NAME = 'SoilHive';
const SITE_URL = 'https://soilhive.ag/app/';
const IMAGE_URL = 'https://soilhive.ag/app/images/soilhive-availability.png';

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildMetadataTitle(datasetName: string): string {
  return `SoilHive: Open Soil Data Platform by Varda - ${datasetName} metadata`;
}

export interface MetadataHeadValues {
  title: string;
  description: string;
  siteName: string;
  url: string;
  image: string;
}

export function getMetadataHeadValues(datasetName: string): MetadataHeadValues {
  return {
    title: buildMetadataTitle(datasetName),
    description: DESCRIPTION,
    siteName: SITE_NAME,
    url: SITE_URL,
    image: IMAGE_URL,
  };
}

export function buildMetadataHeadHtml(datasetName: string): string {
  const v = getMetadataHeadValues(datasetName);
  const title = escapeHtmlAttribute(v.title);
  const description = escapeHtmlAttribute(v.description);
  const siteName = escapeHtmlAttribute(v.siteName);
  const url = escapeHtmlAttribute(v.url);
  const image = escapeHtmlAttribute(v.image);

  return `<title>${title}</title>
    <meta name="description" content="${description}" />

    <meta property="og:title" content="${title}" />
    <meta property="og:site_name" content="${siteName}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="${image}" />

    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />`;
}
