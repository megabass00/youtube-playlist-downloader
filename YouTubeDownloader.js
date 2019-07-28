require('colors');
require('chromedriver');
const webdriver = require('selenium-webdriver');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const matcher = require('string-similarity');

const YOUTUBE_APIKEY = '<your-api-googleapi-key>';
const DOWNLOAD_FOLDER = 'download';
const EXPORT_FOLDER = 'export';

module.exports = class YouTubeDownloader {
  constructor(minRate = 230, minSimilarity = 0.35) {
    this.MIN_RATE = minRate;
    this.MIN_SIMILARITY = minSimilarity;
    this.printInfo();
  }

  printInfo() {
    console.clear();
    this.log(this.logo().red, ' ');
    this.log('Initialized '.cyan + 'YouTubeDownloader'.green + ' with values'.cyan, ' ');
    this.log('Minimum Rate Size:'.gray, `${this.MIN_RATE} kbps`.cyan);
    this.log('Minimum Title Similiarity:'.gray, `${this.MIN_SIMILARITY * 100}%`.cyan);
    this.log(' ', ' ');
  }

  logo() {
    return (
      `

+-+-+-+-+-+-+-+ +-+-+-+-+-+-+-+-+-+-+
|Y|o|u|T|u|b|e| |D|o|w|n|l|o|a|d|e|r|
+-+-+-+-+-+-+-+ +-+-+-+-+-+-+-+-+-+-+

`.red +
      'By '.cyan +
      'megabass00'.yellow +
      '\n'
    );
  }

  async downloadPlaylist(playlistId) {
    this.log('Downloading playlist with ID', playlistId);
    const titles = await this.getTitlesFromPlaylist(playlistId);
    await this.downloadTitles(titles, playlistId);
  }

  async exportPlaylist(playlistId) {
    this.log('Exporting titles from playlist with ID', playlistId);
    const titles = await this.getTitlesFromPlaylist(playlistId);
    const pathToSave = path.resolve(__dirname, EXPORT_FOLDER, playlistId + '.json');
    fs.writeFileSync(pathToSave, JSON.stringify(titles, null, '\t'));
    this.log('Titles exported succesfully in\n'.green, pathToSave.cyan);
  }

  async importAndDownloadFile(pathToFile) {
    if (!fs.existsSync(pathToFile)) {
      this.log('Error:'.bgRed, 'File not exists in this path!!!'.red);
      return;
    }
    const fileName = path.basename(pathToFile).split('.')[0];
    const titles = JSON.parse(fs.readFileSync(pathToFile, 'utf8'));
    await this.downloadTitles(titles, 'import-' + fileName);
  }

  async getTitlesFromPlaylist(playlistId) {
    this.log('Getting titles from', playlistId);
    let titles = [];
    const fnData = async (playlistId, nextPageToken = '') => {
      return axios
        .get('https://www.googleapis.com/youtube/v3/playlistItems', {
          params: {
            key: YOUTUBE_APIKEY,
            part: 'snippet',
            playlistId: playlistId,
            maxResults: 50,
            pageToken: nextPageToken,
          },
        })
        .then(response => {
          response.data.items.map(item => titles.push(item.snippet.title));
          this.log('Adding', response.data.items.length + ' results');
          return response.data.nextPageToken
            ? fnData(playlistId, response.data.nextPageToken)
            : titles;
        });
    };

    await fnData(playlistId)
      .then(response => this.log('Recursive data request finished'.green, ' '))
      .catch(error => this.log('Error getting titles', error));

    return titles;
  }

  async downloadTitles(titles, playlistId = null) {
    this.log('Downloading '.yellow + `${titles.length}`.green, 'titles');
    for (let i = 0; i < titles.length; i++) {
      await this.dowmloadSong(titles[i], playlistId);
    }
  }

  async dowmloadSong(title, playlistId = null) {
    this.log('Downloading song', title);
    const driver = new webdriver.Builder().forBrowser('chrome').build();
    const By = webdriver.By;
    const until = webdriver.until;

    await driver.get('https://my-free-mp3s.com/es');
    await driver.findElement(By.id('query')).sendKeys(title);
    await driver
      .findElement(
        By.css('body > div.wrapper > div > div > div.input-group > span:nth-child(3) > button'),
      )
      .click();
    await driver.wait(until.elementLocated(By.css('#result > div.list-group > li:nth-child(1)')));
    const results = await driver.findElements(By.css('.info-link'));
    const infoButtons = await driver.findElements(
      By.css('.btn.btn-primary.btn-xs.dropdown-toggle'),
    );
    const containers = await driver.findElements(By.css('.list-group-item'));
    if (!results || results.length === 0 || !infoButtons || infoButtons.length === 0) {
      this.log('No results founded for'.red, title.yellow);
      driver.close();
      return;
    }

    this.log(`${results.length} results founded for`, title);
    this.log('Searching the best link for download...', ' ');
    await driver.executeScript('arguments[0].scrollIntoView(true);', infoButtons[0]);

    let data = [];
    for (let i = 0; i < infoButtons.length; i++) {
      await driver.executeScript('arguments[0].click();', infoButtons[i]);
      this._sleep(2000); //TODO esperar hasta que el resultado este mostrado

      const link = await results[i].getAttribute('href');
      const duration = parseInt(await results[i].getAttribute('data-duration'));
      const text = await results[i].getText();
      const rate = this._getRate(text);
      const size = this._getSize(text);
      const navis = await containers[i].findElements(By.id('navi'));
      let title = '';
      for (let k = 0; k < navis.length; k++) {
        title += ' ' + (await navis[k].getText());
      }
      data.push({ link, rate, duration, size, title: title.trim() });
    }

    // this.log('Data', data);
    // data = _getFakeData();
    const bestResult = this._getBestResult(data, title);
    if (!bestResult) {
      this.log('Sorry!!! It not was possible download link for'.red, title.yellow);
      driver.close();
      return;
    }
    this.log('Downloading best result'.yellow, bestResult);
    const downloadFolder = playlistId ? DOWNLOAD_FOLDER + '/' + playlistId : DOWNLOAD_FOLDER;
    this._downloadFile(bestResult.link, title, downloadFolder);

    driver.close();
  }

  _sleep(miliseconds) {
    var e = new Date().getTime() + miliseconds;
    while (new Date().getTime() <= e) {}
  }

  _getSize(str) {
    return str && str.length > 3 && str.indexOf(',')
      ? parseFloat(str.split(',')[0].replace(' MB', ''))
      : 0;
  }

  _getRate(str) {
    return str && str.length > 3 && str.indexOf(',')
      ? parseInt(
          str
            .split(',')[1]
            .trim()
            .slice(1)
            .replace(' kbps', ''),
        )
      : 0;
  }

  _getBestResult(results, originalTitle) {
    const titles = results.map(elem => elem.title);
    const similarity = matcher.findBestMatch(originalTitle, titles);
    results = results.map((res, i) => ({
      title: res.title,
      link: res.link,
      size: res.size,
      rate: res.rate,
      duration: res.duration,
      similarity: similarity.ratings[i].rating,
    }));

    results = results.filter(res => res.similarity > this.MIN_SIMILARITY);
    if (!results.length) {
      this.log('No titles similarity with original title'.red, originalTitle.yellow);
      return null;
    }

    let bestResult = undefined;
    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      if (bestResult) {
        if (parseInt(res.size) >= parseInt(bestResult.size)) {
          if (parseInt(res.size) > parseInt(bestResult.size)) {
            bestResult = res;
          } else {
            if (res.rate >= bestResult.rate) {
              if (res.rate > bestResult.rate) {
                bestResult = res;
              } else {
                if (res.duration > bestResult.duration) {
                  bestResult = res;
                }
              }
            }
          }
        }
      } else {
        if (!bestResult || res.rate >= this.MIN_RATE) bestResult = res;
      }
    }
    return bestResult;
  }

  _downloadFile(url, title, downloadFolder = '') {
    const localPath = path.resolve(__dirname, downloadFolder);
    if (!fs.existsSync(localPath)) fs.mkdirSync(localPath);
    const pathToFile = path.resolve(localPath, title + '.mp3');
    this.log('Saving '.yellow + title.cyan + ' in\n'.yellow, pathToFile.cyan);

    axios
      .get(url, { responseType: 'stream' })
      .then(response => {
        response.data.pipe(fs.createWriteStream(pathToFile));
        this.log('File saved OK'.green, ' ');
      })
      .catch(error => this.log('Error getting titles', error));
  }

  log(key, value) {
    if (!key) key = 'NO KEY'.red;
    if (!value) value = 'UNDEFINED'.red;
    if (typeof value === 'object') value = JSON.stringify(value, null, 3).green;
    console.log(key.yellow, value.green);
  }

  _getFakeData() {
    return [
      {
        url: 'https://s.playx.fun/stream/JvWBZB:MCg2rB',
        size: '8.8 MB',
        rate: '320 kbps',
        duration: 220,
      },
      {
        url: 'https://s.playx.fun/stream/huWBZB:vHg2rB',
        size: '10.1 MB',
        rate: '320 kbps',
        duration: 251,
      },
      {
        url: 'https://s.playx.fun/stream/ZFRuuH:GPhxhB',
        size: '8.9 MB',
        rate: '324 kbps',
        duration: 218,
      },
      {
        url: 'https://s.playx.fun/stream/AfN2M:yu1bpB',
        size: '8.9 MB',
        rate: '323 kbps',
        duration: 220,
      },
      {
        url: 'https://s.playx.fun/stream/-buePM:gaaZu',
        size: '7.6 MB',
        rate: '281 kbps',
        duration: 217,
      },
    ];
  }
};
