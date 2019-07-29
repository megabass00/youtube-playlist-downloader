# YouTube Playlist Downloader
This is a tool written in JavaScript running in Node.js. With this you can download any YouTube playlist and get the mp3 files on your computer. You can also use the YouTubeDownloader class in your own projects.

The files are downloaded from https://my-free-mp3s.com/ to achieve maximum quality. If you wish you can implement your own downloadSong function to customize the download by establishing another source.

## Requeriments
To clone and run this repository you'll need [Git](https://git-scm.com/) and [Node.js](https://nodejs.org/) which comes with npm installed on your computer.

You should also get an apikey from the YouTube API V3. You can watch a video [here](https://www.youtube.com/watch?v=3jZ5vnv-LZc) or you can create one directly from the google console [here](https://console.developers.google.com). When you have obtained your APIKEY, you must add it to the YouTubeDownloader class.

## Installation
```
# Clone this repository
git clone https://github.com/megabass00/youtube-playlist-downloader.git

# Install dependencies
cd youtube-playlist-downloader
npm i
```

## How to use
You must run the application from a console and you can use several operations:
* **playlist**: you must indicate a YouTube playlist ID and the titles will be retrieved from the YouTube API and will be searched on my-free-mp3s. Once the results for each of the titles have been analyzed, the result that best suits the specified parameters (rate and similarity) will be downloaded.
* **song**: you must indicate the title of a song in quotes (it is important) and it will be searched, analyzed and downloaded in the same way as with the playlist operation.
* **export**: you must indicate a YouTube playlist ID to export the titles that will be saved in a json file.
* **download**: you must indicate the path to a json file that contains an array of titles (you can use a file generated with the import operation) which will be downloaded in the same way as with the playlist operation.

To any of these operations you can add the following parameters options:
* **rate**: indicates the minimum rate (in kbps) that will be accepted when analyzing the search results. Results with lower rates than indicated will be discarded. If this parameter is not specified, it will be set with a value of 320 kbps.
* **similarity**: indicates the percentage of similarity in the titles of the results with the original title. Results with a similarity percentage lower than the specified one will be discarded. If this parameter is not specified, it will be set with a value of 80%.

## Examples
```
# Download a playlist
npm start playlist <your-playlist-ID>

# Download single song
npm start song "title-of-the-song"

# Export playlist titles
npm start export <your-playlist-ID>

# Download songs from JSON file
npm start download <path-to-json-file>

# Download single song with 230 kpbs how minimum rate
npm start song "title-of-the-song" rate=230

# Download a playlist with 290 kpbs how minimum rate and similarity to 55%
npm start playlist <your-playlist-ID> rate=290 similarity=55
```