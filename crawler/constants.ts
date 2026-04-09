export const defaultImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAAXNSR0IB2cksfwAAAARnQU1BAACxjwv8YQUAAAAgY0hSTQAAeiYAAICEAAD6AAAAgOgAAHUwAADqYAAAOpgAABdwnLpRPAAAAAlwSFlzAAAuIwAALiMBeKU/dgAAAAxJREFUCNdj+P//PwAF/gL+3MxZ5wAAAABJRU5ErkJggg==',
  'base64'
);
export const absoluteUrlRegExp = new RegExp('^(?:[a-z+]+:)?//', 'i');
export const categoryBanList = [
  'forsíða',
  'heim',
  'vörur',
  'allar vörur',
  'til baka',
  'leitarniðurstöður'
];
export const blockedPageResourceTypes = [
  'image',
  'stylesheet',
  'media',
  'font',
  'websocket',
  'other'
];
export const blockedNavigationPathEndings = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.webp',
  '.mp3',
  '.mp4',
  '.zip',
  '.xlsx',
  '.xls'
];
export const blockedPagePathEndings = [
  ...blockedNavigationPathEndings,
  '.css',
  '.gif',
  '.webm',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf'
];
export const blockedPageUrlPatterns = [
  'google-analytics.com',
  'google.com',
  'google.is',
  'googleads.g.doubleclick.net',
  'googletagmanager.com',
  'adsbygoogle.js',
  'hubspot.com',
  'hubapi.com',
  'hsappstatic.net',
  'youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'addthis.com'
];
