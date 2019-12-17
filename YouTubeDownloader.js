require('chromedriver');
const colors = require('colors');
const webdriver = require('selenium-webdriver');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const matcher = require('string-similarity');
const readlineSync = require('readline-sync');
const progress = require('cli-progress');
const isPortReachable = require('is-port-reachable');
const By = webdriver.By;
const until = webdriver.until;

// const YOUTUBE_APIKEY = 'AIzaSyC9LwtvczTv6gx34F8Sywzx7t2-w5KuZA4'; // you must replace this with your YouTube Api v3 key
const YOUTUBE_APIKEY = 'AIzaSyC9LwtvczTv6gx34F8Sywzx7t2-w5KuZA4';
const DOWNLOAD_FOLDER = 'download';
const EXPORT_FOLDER = 'export';
const TIME_TO_WAIT = 10000; // 10 secs

module.exports = class YouTubeDownloader {
  constructor({ engine, minRate, minSimilarity, noWindow, minimizeWindow, alwaysDownloadFiles, proxyAddress }) {
    this.engine = engine || 'myfreemp3';
    this.minRate = minRate || 320;
    this.minSimilarity = minSimilarity || 60;
    this.noWindow = typeof noWindow === 'undefined' ? true : noWindow;
    this.minimizeWindow = typeof minimizeWindow === 'undefined' ? false : minimizeWindow;
    this.alwaysDownloadFiles = typeof alwaysDownloadFiles === 'undefined' ? true : alwaysDownloadFiles; // undefined;
    this.proxyAddress = proxyAddress || null;
    this.printInfo();
  }

  printInfo() {
    console.clear();
    this.log(this.logo().red, ' ');
    this.log('Initialized '.cyan + 'YouTubeDownloader'.green + ' with options:'.cyan, ' ');
    this.log('Engine:'.gray, `${this.engine.toUpperCase()}`.cyan);
    this.log('Mode:'.gray, `${this.noWindow ? 'Background' : 'Foreground'}`.cyan);
    this.log('Minimum Rate Size:'.gray, `${this.minRate} kbps`.cyan);
    this.log('Minimum Title Similiarity:'.gray, `${this.minSimilarity * 100}%`.cyan);
    this.log('Minimize Window:'.gray, `${this.minimizeWindow ? 'Yes' : 'No'}`.cyan);
    this.log('Always Download Files:'.gray, `${this.alwaysDownloadFiles ? 'Yes' : 'No'}`.cyan);
    this.log('Proxy Address:'.gray, this.proxyAddress ? `${this.proxyAddress}`.cyan : 'No specified'.red);
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
          return response.data.nextPageToken ? fnData(playlistId, response.data.nextPageToken) : titles;
        });
    };

    await fnData(playlistId)
      .then(response => this.log('Recursive data request finished'.green, ' '))
      .catch(error => this.log('Error getting titles', error));

    return titles;
  }

  async downloadTitles(titles, playlistId = null) {
    this.log('----------'.grey);
    this.log('Downloading '.yellow + `${titles.length}`.green, 'titles');
    let titlesNoDownloaded = [];
    for (let i = 0; i < titles.length; i++) {
      // TODO: it need to be fixed, there are titles be added to no download files list when was been downloaded successfully
      const success = await this.dowmloadSong(titles[i], playlistId);
      if (!success) titlesNoDownloaded.push(titles[i]);
    }

    if (titlesNoDownloaded.length > 0)
      this.log('It was not possible to download the following titles'.red, titlesNoDownloaded);
  }

  async dowmloadSong(title, playlistId = null) {
    this.log('Downloading song', title);
    const mustDownload = await this._mustDownloadFile(title);
    if (!mustDownload) {
      this.log(title.yellow + ' was discard'.red, ' ');
      return;
    }

    switch (this.engine) {
      case 'myfreemp3':
        return await this.downloadSongWithMyfreemp3(title, playlistId);
      case 'zippyshare':
        return await this.downloadSongWithZippyshare(title, playlistId);
      case 'youtube':
        return await this.downloadSongWithYoutube(title, playlistId);
      case 'deezer':
        return await this.downloadSongWithDeezer(title, playlistId);
      default:
        return await this.downloadSongWithMyfreemp3(title, playlistId);
    }
  }

  async _getDriver({ proxyAddress, downloadFolder }) {
    let driver;
    var prefs = new webdriver.logging.Preferences();
    prefs.setLevel(webdriver.logging.Type.BROWSER, webdriver.logging.Level.OFF);
    prefs.setLevel(webdriver.logging.Type.DRIVER, webdriver.logging.Level.OFF);
    prefs.setLevel(webdriver.logging.Type.PERFORMANCE, webdriver.logging.Level.OFF);
    prefs.setLevel(webdriver.logging.Type.SERVER, webdriver.logging.Level.OFF);
    prefs.setLevel(webdriver.logging.Type.CLIENT, webdriver.logging.Level.OFF);

    const chrome = require('selenium-webdriver/chrome');
    const localFolder = downloadFolder ? downloadFolder : path.resolve(__dirname, DOWNLOAD_FOLDER);
    let options = new chrome.Options();
    // options.setCapability('acceptSslCerts', true);
    options.addArguments('--ignore-certificate-errors');
    options.setUserPreferences({
      'download.default_directory': localFolder,
      'safebrowsing.enabled': false,
    });

    if (this.noWindow) {
      this.log('Initializing webdriver in '.gray + 'background'.yellow + ' mode'.gray, ' ');
      options
        .addArguments('--no-startup-window')
        .addArguments('--disable-web-security')
        .headless();

      if (proxyAddress) {
        this.log('Setting proxy in driver with IP'.gray, proxyAddress.yellow);
        const moreOptions = options.addArguments(`--proxy-server=http://${proxyAddress}`);
        driver = new webdriver.Builder()
          .forBrowser('chrome')
          .setChromeOptions(moreOptions)
          .setLoggingPrefs(prefs)
          .build();
      } else {
        driver = new webdriver.Builder()
          .forBrowser('chrome')
          .setChromeOptions(options)
          .setLoggingPrefs(prefs)
          .build();
      }
    } else {
      this.log('Initializing webdriver in '.gray + 'foreground'.yellow + ' mode'.gray, ' ');

      if (proxyAddress) {
        this.log('Setting proxy in driver with IP'.gray, proxyAddress.red);
        const moreOptions = options.addArguments(`--proxy-server=http://${proxyAddress}`);
        driver = new webdriver.Builder()
          .forBrowser('chrome')
          .setChromeOptions(moreOptions)
          .setLoggingPrefs(prefs)
          .build();
      } else {
        driver = new webdriver.Builder()
          .forBrowser('chrome')
          .setChromeOptions(options)
          .setLoggingPrefs(prefs)
          .build();
      }
    }

    if (!this.noWindow && this.minimizeWindow) {
      await driver
        .manage()
        .window()
        .minimize();
    }

    return driver;
  }

  async downloadSongWithMyfreemp3(title, playlistId = null) {
    const driver = await this._getDriver({});

    await driver.get('https://my-free-mp3s.com/es');
    await driver.wait(until.elementLocated(By.id('footer')));
    await driver.findElement(By.id('query')).sendKeys(title);
    await driver.findElement(By.css('.btn.btn-primary.search')).click();
    await driver.wait(until.elementLocated(By.css('#result > div.list-group > li:nth-child(1)')));
    const results = await driver.findElements(By.css('.info-link'));
    const infoButtons = await driver.findElements(By.css('.btn.btn-primary.btn-xs.dropdown-toggle'));
    const containers = await driver.findElements(By.css('.list-group-item'));
    const links = await driver.findElements(By.css('.info-link'));

    if (!results || results.length === 0 || !infoButtons || infoButtons.length === 0) {
      this.log('No results founded for'.red, title.yellow);
      driver.close();
      return false;
    }

    this.log(`${results.length} results founded for`, title);
    this.log('Searching the best link for download...'.gray, ' ');
    await driver.executeScript('arguments[0].scrollIntoView(true);', infoButtons[0]);

    let data = [];
    for (let i = 0; i < infoButtons.length; i++) {
      await driver.executeScript('arguments[0].click();', infoButtons[i]);
      await driver.wait(until.elementIsVisible(links[i]));
      await driver
        .wait(() => links[i].getText().then(value => value && value.length > 3), TIME_TO_WAIT)
        .catch(() => this.log('Warning'.red, 'No was possible get info of link'.yellow));

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
      if (title && title !== '') {
        data.push({ link, rate, duration, size, title: title.trim() });
      }
    }

    const bestResult = this._getBestResult(data, title);
    if (!bestResult) {
      this.log('Sorry!!! It not was possible download link for'.red, title.yellow);
      driver.close();
      return false;
    }

    this.log('Downloading best result'.yellow, bestResult);
    const downloadFolder = playlistId ? DOWNLOAD_FOLDER + '/' + playlistId : DOWNLOAD_FOLDER;
    await this._downloadFile(bestResult.link, this._capitalize(title), downloadFolder);

    driver.close();
    return true;
  }

  async downloadSongWithZippyshare(title, playlistId = null) {
    const downloadFolder = this._getDownloadFolder(playlistId);
    const driver = await this._getDriver({ downloadFolder });

    await driver.get('https://www.zippysharedjs.com/');
    await driver.wait(until.elementLocated(By.id('search')));
    await driver.findElement(By.id('search')).sendKeys(title);
    await driver.findElement(By.css('#search-form > div > button')).click();
    await driver.wait(until.elementLocated(By.css('.gsc-resultsbox-visible')));

    const results = await driver.findElements(By.css('.gs-webResult.gs-result'));
    if (!results || results.length === 0) {
      this.log('No results founded for'.red, title.yellow);
      driver.close();
      return false;
    }

    this.log(`${results.length} results founded for`, title);
    this.log('Searching the best link for download...'.gray, ' ');

    let data = [];
    for (let i = 0; i < results.length; i++) {
      await driver.executeScript('arguments[0].click();', results[i]);
      const infoText = await results[i]
        .findElement(
          By.css('div.gsc-table-result > div.gsc-table-cell-snippet-close > div.gs-bidi-start-align.gs-snippet'),
        )
        .getText();
      const sizeText = infoText.substring(infoText.indexOf('Size: ') + 6, infoText.indexOf(' MB'));
      const size = parseFloat(sizeText);
      const title =
        infoText.indexOf('.mp3') > -1
          ? infoText.substring(infoText.indexOf('Name: ') + 6, infoText.lastIndexOf('.mp3'))
          : infoText.indexOf(',mp3') > -1
          ? infoText.substring(infoText.indexOf('Name: ') + 6, infoText.lastIndexOf(',mp3'))
          : infoText.indexOf('Size: ') > -1
          ? infoText.substring(infoText.indexOf('Name: ') + 6, infoText.lastIndexOf('Size: ') - 1)
          : '???';

      // const infoTitle = await results[i].findElement(By.css('div.gsc-thumbnail-inside > div > a')).getText();
      // const title = infoTitle.substring(0, infoText.indexOf('.mp3'));
      const link = await results[i].findElement(By.css('div.gsc-thumbnail-inside > div > a')).getAttribute('href');
      const rate = 320.0;
      const duration = 0.0;

      if (title && title !== '') {
        data.push({ link, rate, duration, size, title: title.trim() });
      }
    }
    this.log('RESULTS', data);
    const bestResult = this._getBestResult(data, title);
    if (!bestResult) {
      this.log('Sorry!!! It not was possible download link for'.red, title.yellow);
      driver.close();
      return false;
    }

    this.log('Downloading best result'.yellow, bestResult);
    driver.close();

    const proxyIp = await this._getProxy();
    const proxy = await this._getDriver({ proxyAddress: proxyIp });
    await proxy.get(bestResult.link);
    await proxy.wait(until.elementsLocated(By.css('.download')));
    await proxy.findElement(By.css('.download')).click();
    this.log('Downloading '.gray + bestResult.title.yellow + ' across proxy'.gray, proxyIp.green);

    const pathToFile = this._getDownloadPath(title, playlistId);
    const downloadResult = this._fileIsDownloaded(pathToFile);
    proxy.close();
    return downloadResult;
  }

  async downloadSongWithYoutube(title, playlistId = null) {
    const driver = await this._getDriver({});
    this.minSimilarity = 100;

    await driver.get('https://mpgun.com/');
    await driver.wait(until.elementLocated(By.css('#about > div > div:nth-child(2) > div > h3:nth-child(5)')));
    await driver.findElement(By.css('#autocomplte')).sendKeys(title);
    await driver.findElement(By.css('.btn.btn-primary.btn-xlg.ng-binding')).click();
    await driver.wait(until.elementLocated(By.css('.addon.ng-scope')));
    const results = await driver.findElements(By.css('.addon.ng-scope > ul > li'));

    if (!results || results.length === 0) {
      this.log('No results founded for'.red, title.yellow);
      driver.close();
      return false;
    }

    this.log(`${results.length} results founded for`, title);
    this.log('Searching the best link for download...'.gray, ' ');

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      await driver.executeScript('arguments[0].click();', result);

      const tmpTitle = await result.findElement(By.css('div > div > div.legend-info.col-sm-10 > p')).getText();
      if (tmpTitle && tmpTitle.replace(/(?!\w)./g, '') === title.replace(/(?!\w)./g, '')) {
        // const navbar = await driver.findElement(By.css('.navbar-collapse'));
        // await driver.executeScript("arguments[0].setAttribute('style','visibility:hidden;');", navbar);
        const mp3Button = await result.findElement(
          By.css('div > div > div.legend-info.col-sm-10 > div > a:nth-child(2)'),
        );
        await driver.executeScript('arguments[0].click();', mp3Button);
        await driver.wait(until.urlContains('youtube-to-mp3.html'));
        const link = await driver.findElement(By.id('mp3')).getAttribute('href');
        this.log('Downloading best link'.yellow, link.gray);

        const downloadFolder = playlistId ? DOWNLOAD_FOLDER + '/' + playlistId : DOWNLOAD_FOLDER;
        const success = await this._downloadFile(link, this._capitalize(title), downloadFolder);
        driver.quit();
        return success;
      }
      this.log(tmpTitle.yellow, ' was discard'.red);
    }

    this.log('Sorry!!! It not was possible download link for'.red, title.yellow);
    driver.close();
    return false;
  }

  async downloadSongWithDeezer(title, playlistId = null) {
    const downloadFolder = this._getDownloadFolder(playlistId);
    const pathToSave = this._getDownloadPath(title, playlistId);

    const driver = await this._getDriver({ downloadFolder });
    await driver.get('https://free-mp3-download.net/');
    await driver.wait(until.elementLocated(By.id('q')));
    await driver.findElement(By.id('q')).sendKeys(title);
    await driver.findElement(By.id('snd')).click();
    await driver.wait(until.elementLocated(By.id('results_t')), TIME_TO_WAIT).catch(() => {});

    const results = await driver.findElements(By.css('#results_t > tr'));
    if (!results || results.length === 0) {
      this.log('No results founded for'.red, title.yellow);
      driver.close();
      return false;
    }

    this.log(`${results.length} results founded for`, title);
    this.log('Searching the best link for download...'.gray, ' ');

    let data = [];
    for (let i = 0; i < results.length; i++) {
      await driver.executeScript('arguments[0].click();', results[i]);

      const link = await results[i].findElement(By.css('td:nth-child(3) > a')).getAttribute('href');
      let duration = await results[i].findElement(By.css('td:nth-child(2)')).getText();
      duration = this._getSecondsFromString(duration);
      const rate = 320;
      const size = ((rate / 8) * duration) / 1024;
      const title = await results[i].findElement(By.css('td:nth-child(1)')).getText();
      data.push({ link, rate, duration, size, title: title.trim() });
    }

    const bestResult = this._getBestResult(data, title);
    if (!bestResult) {
      this.log('Sorry!!! It not was possible download link for'.red, title.yellow);
      driver.close();
      return false;
    }

    this.log('Downloading best result'.yellow, bestResult);
    await driver.get(bestResult.link);
    await driver.wait(until.elementLocated(By.id('captcha')));
    await driver.executeScript('arguments[0].scrollIntoView(true);', await driver.findElement(By.id('captcha')));
    this.log('Enter CAPTCHA', 'Please, it needs you enter the captcha manually...');

    const captchaIFrame = driver.findElement(By.css('#captcha > div > div > div > iframe'));
    await driver.switchTo().frame(captchaIFrame);
    await driver.wait(until.elementLocated(By.css('.recaptcha-checkbox-checked')));
    this.log('CAPTCHA', 'checked');

    await driver.switchTo().parentFrame();
    await driver.findElement(By.css('.dl.btn.waves-effect.waves-light.blue.darken-4')).click();

    await driver.wait(until.elementLocated(By.id('textPerc')));
    this.log('Downloading '.gray + bestResult.title.yellow + '...'.gray);
    const preload = await driver.findElement(By.id('textPerc'));
    await driver.wait(driver => {
      return preload.getText().then(text => text === 'Downloading (0%)');
    }, TIME_TO_WAIT);

    const downloadResult = this._fileIsDownloaded(pathToSave);
    driver.close();
    return downloadResult;
  }

  async downloadZippyshareLink(link) {
    const proxyIp = await this._getProxy();
    const proxy = await this._getDriver({ proxyAddress: proxyIp });
    await proxy.get(link);
    await proxy.wait(until.elementsLocated(By.css('.download')));
    await proxy.findElement(By.css('.download')).click();
    this.log('Downloading zippy link '.gray + link.yellow + ' across proxy'.gray, proxyIp.green);

    this._sleep(3000);
    const filename = this._getLastDownloadFileName();
    if (filename) {
      const pathToFile = this._getDownloadPath(filename);
      const downloadResult = this._fileIsDownloaded(pathToFile, false);
      proxy.close();
      return downloadResult;
    } else {
      proxy.close();
      return false;
    }
  }

  _fileExists(pathToFile) {
    return fs.existsSync(pathToFile);
  }

  _getLastDownloadFileName(playlistId = null) {
    let downloadFolder = this._getDownloadFolder(playlistId);
    if (
      downloadFolder.substring(downloadFolder.length - 1) != '/' ||
      downloadFolder.substring(downloadFolder.length - 1) != '\\'
    )
      downloadFolder += '/';

    const files = fs.readdirSync(downloadFolder);
    let filename = files.find(file => path.extname(file).toLowerCase() === '.crdownload');
    if (filename) filename = filename.replace('.mp3.crdownload', '');
    this.log('Last download filename', filename);
    return filename || null;
  }

  _fileIsDownloaded(pathToFile, timeOut = true) {
    const timeOffset = timeOut ? TIME_TO_WAIT : 15 * 60 * 1000; // maximum time to wait in miliseconds
    const timeLimit = new Date().getTime() + timeOffset;
    const baseName = path.basename(pathToFile);

    let isDownloaded = false;
    let timeExceded = false;
    if (!this._fileExists(pathToFile))
      this.log(`Waiting until ${baseName} is downloaded for ${this._getTimeStringFromMiliseconds(timeOffset)}...`.gray);

    while (!isDownloaded && !timeExceded) {
      if (this._fileExists(pathToFile)) {
        isDownloaded = true;
        this.log(`Checking ${baseName} file`.gray, 'File is downloaded'.green);
      } else {
        this._sleep(1000);
      }
      timeExceded = timeLimit < new Date().getTime();
      if (timeExceded) this.log(`Checking ${baseName} file`.gray, `Timeout exceded (${timeOffset / 1000} sec)`.red);
    }
    if (isDownloaded) {
      this.log('\n\nSaved '.yellow + baseName.cyan + ' in\n'.yellow, pathToFile.cyan);
    } else {
      const error = timeLimit ? 'Timeout was exceded' : 'It was not possible download file';
      this.log('Error downloading file'.red, error.red);
    }

    return isDownloaded;
  }

  _sleep(miliseconds) {
    var e = new Date().getTime() + miliseconds;
    while (new Date().getTime() <= e) {}
  }

  _getSize(str) {
    return str && str.length > 3 && str.indexOf(',') ? parseFloat(str.split(',')[0].replace(' MB', '')) : 0;
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
    const titles = results.map(elem => elem.title.toUpperCase());
    const similarity = matcher.findBestMatch(originalTitle.toUpperCase(), titles);
    results = results.map((res, i) => ({
      title: res.title,
      link: res.link,
      size: res.size,
      rate: res.rate,
      duration: res.duration,
      similarity: similarity.ratings[i].rating,
    }));

    // const coincidences = results.filter(res => {
    //   this.log('orig', originalTitle.toUpperCase());
    //   this.log('res', res.title.toUpperCase());
    //   this.log('ok', res.title.toUpperCase().includes(originalTitle.toUpperCase()));
    //   return res.title.toUpperCase().includes(originalTitle.toUpperCase());
    // });
    // this.log('coincidences', coincidences);

    results = results.filter(res => res.similarity > this.minSimilarity);
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
        if (!bestResult || res.rate >= this.minRate) bestResult = res;
      }
    }
    return bestResult;
  }

  async _isValidProxy(proxyAddress) {
    if (!proxyAddress || proxyAddress.indexOf(':') < 0) return false;
    const parts = proxyAddress.split(':');
    this.log(`Checking proxy ${parts[0]} in port ${parts[1]}...`.green);
    return await isPortReachable(parts[1], { host: parts[0] });
  }

  async _getProxy() {
    if (this.proxyAddress) {
      if (await this._isValidProxy(this.proxyAddress)) return this.proxyAddress;
      this.log(`Proxy address ${this.proxyAddress} is not valid`.red);
    }

    const fnProxy = async () => {
      const res = await axios
        .get('http://pubproxy.com/api/proxy?level=elite&speed=25&https=true') // only retrieve proxies with elite level and https support
        .catch(err => this.log('There was an error while getting a proxy'.red, err.Error));
      const { data } = await res;
      return data.data[0];
    };

    this.log('Getting free public proxy...'.yellow);
    let success = false;
    let proxyData;
    while (!success) {
      proxyData = await fnProxy();
      if (proxyData && proxyData.support.https == 1 && (await this._isValidProxy(proxyData.ipPort))) {
        success = true;
      } else {
        this.log('Discard proxy'.red, proxyData.ipPort.yellow);
        this._sleep(1000); // wait one secont between requests to avoid locks
      }
    }
    this.log('Revored proxy', proxyData);
    this.log(
      `Revored proxy with IP ${proxyData.ipPort} and speed=${proxyData.speed} from ${proxyData.country} and supports cookies=${proxyData.support.cookies}`,
    );
    this.proxyAddress = proxyData.ipPort;
    return proxyData.ipPort;
  }

  async _getSanitizedProxy(proxyAddress = false) {
    if (!proxyAddress) {
      proxyAddress = await this._getProxy();
    }
    proxyAddress = proxyAddress.split(':');
    return { host: proxyAddress[0], port: proxyAddress[1] };
  }

  async _mustDownloadFile(title, playlistId) {
    if (typeof this.alwaysDownloadFiles !== 'undefined' && this.alwaysDownloadFiles) return true;
    const downloadFolder = playlistId ? DOWNLOAD_FOLDER + '/' + playlistId : DOWNLOAD_FOLDER;
    const pathToFile = path.resolve(downloadFolder, title + '.mp3');

    if (this._fileExists(pathToFile)) {
      const options = ['Yes', 'No', 'Always', 'Never'];
      const index = readlineSync.keyInSelect(
        options,
        'This title is present in downloads folder,\nyou wish download again?'.red,
      );
      switch (index) {
        case 0: // Yes
          return true;

        case 1: // No
          return false;

        case 2: // Always
          this.alwaysDownloadFiles = true;
          return true;

        case 3: // Never
          this.alwaysDownloadFiles = false;
          return false;

        default:
          return true;
      }
    }
  }

  async _downloadFile(url, title, downloadFolder = '') {
    const localPath = path.resolve(__dirname, downloadFolder);
    if (!fs.existsSync(localPath)) fs.mkdirSync(localPath);
    const titleEncoded = title.replace(/[^\w\s]/gi, '');
    this.log('Encoded title', titleEncoded);
    const pathToFile = path.resolve(localPath, titleEncoded + '.mp3');
    // const pathToFile = path.resolve(localPath, title + '.mp3');

    const preset = {
      format: colors.green(' {bar}') + colors.yellow(' {percentage}% | ETA: {eta}s | {value}/{total} Mb'),
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
    };
    const progressBar = new progress.Bar({ barsize: 70 }, preset);

    return await axios
      .get(url, { responseType: 'stream' })
      .then(response => {
        return new Promise(resolve => {
          const totalBytes = response.headers['content-length'] / 1048576;
          progressBar.start(totalBytes.toFixed(1), 0);
          const stream = fs.createWriteStream(pathToFile);
          response.data.on('data', chunk => progressBar.increment(chunk.length / 1048576));
          response.data.pipe(stream).on('finish', () => {
            progressBar.stop();
            this.log('\n\nSaved '.yellow + title.cyan + ' in\n'.yellow, pathToFile.cyan);
            return resolve(true);
          });
        });
      })
      .catch(error => {
        progressBar.stop();
        this.log('Error downloading file'.red, error.red);
        return false;
      });
  }

  _getDownloadPath(title, playlistId = null) {
    const localPath = this._getDownloadFolder(playlistId);
    if (!fs.existsSync(localPath)) fs.mkdirSync(localPath);
    const pathToFile = path.resolve(localPath, title + '.mp3');
    return pathToFile;
  }

  _getDownloadFolder(playlistId = null) {
    const downloadFolder = playlistId ? DOWNLOAD_FOLDER + '/' + playlistId : DOWNLOAD_FOLDER;
    const localFolder = path.resolve(__dirname, downloadFolder);
    return localFolder;
  }

  _capitalize(str) {
    str = str.replace(/\s\s+/g, ' ').split(' ');
    for (var i = 0, x = str.length; i < x; i++) {
      str[i] = str[i][0].toUpperCase() + str[i].substr(1).toLowerCase();
    }
    return str.join(' ');
  }

  _getSecondsFromString(strTime) {
    if (!strTime || !strTime.includes(':')) return 0;
    const a = strTime.split(':');
    if (a.length === 3) {
      return parseInt(a[0]) * 60 * 60 + parseInt(a[1]) * 60 + parseInt(a[2]);
    } else if (a.length === 2) {
      return parseInt(a[0]) * 60 + parseInt(a[1]);
    } else {
      return parseInt(a[0]);
    }
  }

  _getTimeStringFromMiliseconds(miliseconds) {
    const dateObj = new Date(miliseconds);
    const hours = dateObj.getUTCHours();
    const minutes = dateObj.getUTCMinutes();
    const seconds = dateObj.getSeconds();

    let timeString = '';
    if (hours > 0) timeString += hours.toString().padStart(2, '0') + ' hours ';
    if (minutes > 0) timeString += minutes.toString().padStart(2, '0') + ' minutes ';
    if (seconds > 0) timeString += seconds.toString().padStart(2, '0') + ' secs ';
    return timeString;
  }

  log(key, value = ' ') {
    if (!key) key = 'NO KEY'.red;
    if (typeof value === 'object') value = JSON.stringify(value, null, 3).green;
    if (typeof value === 'number') value = String(value);
    if (typeof value === 'boolean') value = !value ? 'false' : 'true';
    if (!value) value = 'UNDEFINED'.red;
    console.log(key.yellow, value.green);
  }
};
