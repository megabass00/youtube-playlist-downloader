const getParam = (param, defaultVal = '') => {
  let paramValue = defaultVal;
  param += '=';
  process.argv.forEach(val => {
    if (val.indexOf(param) > -1) paramValue = val.substring(param.length);
  });
  return paramValue;
};

const checkOption = (param, defaultVal = false) => {
  let paramValue = defaultVal;
  process.argv.forEach(val => {
    if (val.indexOf(param) > -1) paramValue = true;
  });
  return paramValue;
};

require('colors');
const YouTubeDonwloader = require('./YouTubeDownloader');

const minRate = parseInt(getParam('rate', 320));
const minSimilarity = parseInt(getParam('similarity', 80)) / 100;
const engine = getParam('engine', 'myfreemp3');
const proxyAddress = getParam('proxy', false);
const noWindow = checkOption('no-window', false);
const minimizeWindow = checkOption('minimize', false);
const alwaysDownloadFiles = checkOption('alwaysDownloadFiles', true);

const downloader = new YouTubeDonwloader({
  engine,
  minRate,
  minSimilarity,
  noWindow,
  minimizeWindow,
  alwaysDownloadFiles,
  proxyAddress,
});
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
