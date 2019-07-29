const getParam = (param, defaultVal = '') => {
  let paramValue = defaultVal;
  param += '=';
  process.argv.forEach(val => {
    if (val.indexOf(param) > -1) paramValue = val.substring(param.length);
  });
  return paramValue;
};

require('colors');
const YouTubeDonwloader = require('./YouTubeDownloader');

const minRate = parseInt(getParam('rate', 320));
const minSimilarity = parseInt(getParam('similarity', 0.8)) / 100;
const downloader = new YouTubeDonwloader(minRate, minSimilarity);
const args = process.argv.slice(2);

switch (args[0]) {
  case 'playlist':
    if (!args[1]) {
      downloader.log('Error:'.bgRed, 'You must enter a valid playlist ID'.red);
      return;
    }
    downloader.downloadPlaylist(args[1]);
    break;

  case 'song':
    if (!args[1]) {
      downloader.log('Error:'.bgRed, 'You must enter a song title wrapped between quotes'.red);
      return;
    }
    downloader.dowmloadSong(args[1]);
    break;

  case 'export':
    if (!args[1]) {
      downloader.log('Error:'.bgRed, 'You must enter a valid playlist ID for export'.red);
      return;
    }
    downloader.exportPlaylist(args[1]);
    break;

  case 'download':
    if (!args[1]) {
      downloader.log('Error:'.bgRed, 'You must enter a valid file path'.red);
      return;
    }
    downloader.importAndDownloadFile(args[1]);
    break;

  default:
    downloader.log('Error'.bgRed, 'Sorry, enter a valid operation'.red);
    downloader.log('Valid operations:'.yellow, '(playlist | song | export | download)'.cyan);
}

// downloader.downloadPlaylist(PLAYLIST_ID);
// downloader.dowmloadSong('Boytronic ‎– You [Original 12" 1983');
// downloader.dowmloadSong('MEGABEAT es imposible no puede ser.wmv');
// downloader.downloadFile('https://s.playx.fun/JvWBZB:MCg2rB', 'prueba');
