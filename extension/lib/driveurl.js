export function fileIdFromDriveRequestUrl(url) {
  if (!url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.origin !== 'https://drive.google.com') return null;

  const docosMatch = /^\/file\/(?:[^/]+\/)*d\/([\w-]+)\/docos\/p\/sync$/.exec(parsed.pathname);
  if (docosMatch) return docosMatch[1];

  if (parsed.pathname === '/drivesharing/clientmodel') {
    return parsed.searchParams.get('id') || null;
  }
  return null;
}
