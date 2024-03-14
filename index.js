const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const readline = require('readline');
const fs = require('fs');
const https = require('https');
const path = require('path');

puppeteer.use(StealthPlugin());

async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        const fileStream = fs.createWriteStream(filepath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          console.log('Downloaded file: ' + filepath);
          resolve();
        });
      } else {
        res.resume(); // Consume response data to free up memory
        reject(new Error(`Request Failed With a Status Code: ${res.statusCode}`));
      }
    }).on('error', (e) => {
      console.error(`Got error: ${e.message}`);
      reject(e);
    });
  });
}

async function checkPageExists(page, url) {
  const response = await page.goto(url, { waitUntil: 'networkidle2' }).catch(e => null);
  return response && response.status() === 200;
}

async function scrapeImagesSequentially(baseUrl, chapterStart = 1, chapterEnd = 1000) {
  const browser = await puppeteer.launch({ headless: true });

  // add ?style=list
  if (!baseUrl.endsWith("?style=list")) {
    baseUrl += "?style=list";
  }

  for (let currentChapter = chapterStart; currentChapter <= chapterEnd; currentChapter++) {
    let chapterFound = false;

    const chapterVariations = [
      `${currentChapter}`, // 예: "4"
      `0${currentChapter}`, // 예: "04"
      `00${currentChapter}`, // 예: "004"
      `${currentChapter}_1`, // 예: "4_1"
      `${currentChapter}_2`  // 예: "4_2"
    ];

    for (let variation of chapterVariations) {
      const page = await browser.newPage();
      // URL 생성 로직을 이용하여 챕터 번호가 적용된 URL을 생성
      const attemptUrl = baseUrl.replace(/(\d+)(\/?\?style=list)$/, `${variation}$2`);

      console.log(`Attempting URL: ${attemptUrl}`);

      if (await checkPageExists(page, attemptUrl)) {
        const pageContent = await page.content();

        if (!pageContent.includes('//a.realsrv.com/popunder1000.js')) {
          console.log(`Scraping images from: ${attemptUrl}`);

          const dataChapter = await page.evaluate(() => {
            const mangaReadingNavHead = document.querySelector('#manga-reading-nav-head');
            return mangaReadingNavHead ? mangaReadingNavHead.dataset.chapter : 'default';
          });

          const imgUrls = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('img'))
                        .filter(img => img.src)
                        .map(img => img.src);
          });

          const downloadPath = path.resolve(__dirname, 'downloaded_images', dataChapter);
          if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
          }

          for (let i = 0; i < imgUrls.length; i++) {
            const imgUrl = imgUrls[i];
            const fileExtension = path.extname(new URL(imgUrl).pathname);
            const filename = `${i + 1}${fileExtension}`;
            const filepath = path.join(downloadPath, filename);
            await downloadImage(imgUrl, filepath).catch(console.error);
          }

          chapterFound = true;
          break; // 유효한 페이지를 찾으면 다음 변형으로 넘어갑니다.
        }
      }

      await page.close(); // 현재 페이지를 닫고 다음 변형을 시도합니다.
    }

    

    if (!chapterFound) {
      console.log(`No valid pages found for chapter ${currentChapter}, stopping search.`);
      break; // 유효한 챕터를 찾지 못하면 검색을 중단합니다.
    }
  }

  await browser.close();
}

const baseUrl = 'example.com';
scrapeImagesSequentially(baseUrl);