const express = require('express');
const path = require('path');
const ccxt = require('ccxt');

const WebSocket = require('ws');
const { isStringObject } = require('util/types');

const Queue = require('./custom_modules/queue'); // Queue sınıfını içe aktar

// const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware Fuctions>

// JSON gövdelerini parse etmek için middleware
app.use(express.json());

// <Middleware Fuctions

// Binance websocket data>

//WS TICKERS> - Casues high process and server can shut with 1006 error? 
// const wsTicker = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker-24hr');

// let binanceWebSocketTickerData = null;

// wsTicker.on('open', () => {
//   console.log("Binance Websocket Ticker bağlantısı kuruldu.");
// });
// wsTicker.on('message', (data) => {

//   try {
//     binanceWebSocketTickerData = JSON.parse(data);
//     // console.log('Alınan veri : ', webSocketTickerData);
//   }
//   catch (error) {
//     console.error('WebSocket ticker verisi ayrıştırılamadı:', error);
//   }
//   // const ticker = JSON.parse(data);
//   // console.log(`24 Saatlik BTC/USDT Ortalama Fiyat: ${binanceWebSocketTickerData.w}`); // `c` son fiyatı temsil eder
// });
// wsTicker.on('error', (err) => {
//   console.error('WebSocket ticker Hatası:', err);
// });
// wsTicker.on('close', () => {
//   console.log('WebSocket ticker bağlantısı kapandı. Yeniden bağlanmayı düşünebilirsiniz.');
// });
// <WS TICKERS


// const wsTrades = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@trade');
// let binanceWebSocketTradesData = [];

const popularCoinsWSFormat = [
  'btcusdt', 'ethusdt', 'bnbusdt', 'xrpusdt', 'solusdt',
  'adausdt', 'dogeusdt', 'maticusdt', 'dotusdt', 'shibusdt',
  'ltcusdt', 'avaxusdt', 'linkusdt', 'atomusdt', 'xlmusdt',
  'vetusdt', 'aptusdt', 'luncusdt', 'icpusdt', 'nearusdt',
  'filusdt', 'qntusdt', 'galausdt', 'sandusdt', 'manausdt',
  'chzusdt', 'axsusdt', 'enjusdt', 'ftmusdt', 'egldusdt',
  'hbarusdt', 'xtzusdt', 'eosusdt', 'zilusdt', 'iostusdt',
  'cakeusdt', 'ksmusdt', 'cvxusdt', 'kavausdt', 'runeusdt',
  'crvusdt', '1inchusdt', 'balusdt', 'compusdt', 'avaxeth',
  'wavesusdt', 'dydxusdt', 'renusdt', 'arbusdt', 'hotusdt',
  'dashusdt', 'roseusdt', 'bnbeth', 'uniusdt', 'omgusdt',
  'hiveusdt', 'xemusdt', 'zrxusdt', 'batbtc', 'xlmbtc',
  'dogebtc', 'solbtc', 'adabtc', 'ethbtc', 'bnbbtc',
  'trxbtc', 'maticbtc', 'linkbtc', 'ltcbtc', 'atombtc',
  'ftmbtc', 'sandbtc', 'manabtc', 'axsbnb', 'ksmbtc',
  'chzbtc', 'icpbtc', 'qntbtc', 'algobtc', 'filbtc',
  'zilbtc', 'eosbtc', 'iostbtc', 'thetabtc', 'vetbtc',
  '1inchbtc', 'balbtc', 'ltcbnb', 'wavesbtc'
];

var WsSymbolsToFetch = popularCoinsWSFormat; //['btcusdt', 'ethbtc', 'xrpbtc'];
var FetchingThreads = {0: WsSymbolsToFetch};
var binanceWebSocketTradesData = {'btcusdt': [], 'ethbtc': [], 'xrpbtc': []}; //... //FETCHED COINS STORED DATA
var FetchingDataResetting = false;

var wsConnections = [];

const queue = new Queue();

function UpdateSleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
let InitialFiltrationCompleted = false;
async function InitialFiltration() {
  await UpdateSleep(5);
  await FetchMarketsInternal();
  FormatBinanceMarketDataToWS();

  const RawList = Array.from(WsSymbolsToFetch);

  //check if there are invalids
  for (const element of RawList) {
    const included = BinanceMarketsWSFormat.includes(element.toLowerCase()); //check if inputted coin is available
    // console.log(BinanceMarketsWSFormat);

    if (!included) {
      const index = WsSymbolsToFetch.indexOf(element);
      WsSymbolsToFetch.splice(index, 1);
      console.log("Başlangıç listesinde anlamsız coin symbolü bulundu: ", element);
    }
  }

  InitialFiltrationCompleted = true;

  // console.log(WsSymbolsToFetch); //new list
}

const fetchTradeDataForSymbol = (symbols) => {
  return new Promise((resolve, reject) => {
    // const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@trade`); // single connection
    const correctedSymbolList = symbols.map(item => item + "@trade");
    const correctedSymbols = correctedSymbolList.join("/");
    const ws = new WebSocket(`wss://stream.binance.com:443/stream?streams=${correctedSymbols}`); // multi-link "example: ?streams=btcusdt@trade/ethusdt@trade"
    wsConnections.push(ws);

    ws.on('open', () => {
      console.log(`${symbols} WebSocket bağlantısı açıldı.`);
      resolve(ws.binaryType);

      StartCleanOldTradesInterval();
    });

    // ws.onopen = function() {
    //   setInterval(() => {
    //     if (ws.readyState === WebSocket.OPEN) {
    //       ws.ping();  // Sunucu bağlantısının kopmaması için ara sıra ping mesajı gönder
    //     }
    //   }, 600000);
    // };

    // Gelen ping/pong yanıtlarını işaretleyelim
    ws.on('pong', () => {
      console.log('Sunucu yanıtladı!');
      isAlive = true;
    });

    ws.on('ping', (data) => {
      console.log('Ping alındı. Payload:', data.toString());
  
      // Otomatik olarak bir pong yanıtı gönderebilirsiniz
      ws.pong(data);
      console.log('Pong yanıtı gönderildi.');
    });

    // !!! BURADAKİ İŞLEMLER BİR SÜRE SONRA BİNANCE SUNUCUNUN 1006 HATASI VERİP BAĞLANTIYI KAPATMASINA SEBEP OLUYOR..!!! 
    ws.on('message', (data) => {

      // queue.add(async () => {
      //   try {
      //     const tradeData = JSON.parse(data);
      //     // console.log(`${symbols} için gelen veriler:`, tradeData);
  
      //     const timestamp = Date.now();
      //     const tradeDataObject = {...tradeData.data, timestamp,}; //stream included binance url sends object list has two elements "stream and data".
  
      //     // binanceWebSocketTradesData[symbols].push(tradeDataObject);
  
      //     // WriteTradesDataValues(String(tradeDataObject.s).toLowerCase(), tradeDataObject); // attention
      //     const symbol = String(tradeDataObject.s).toLowerCase();
      //     if (!binanceWebSocketTradesData[symbol]) { 
      //       binanceWebSocketTradesData[symbol] = []; 
      //     }
      //     binanceWebSocketTradesData[symbol].push(tradeDataObject);
  
      //     // clean4hOldTrades(symbols);
  
      //     // console.log("Güncel veri : ", binanceWebSocketTradesData[symbols]);
      //   }
      //   catch (error) {
      //     console.error('WebSocket trades verisi ayrıştırılamadı:', error);
      //   }
      // });

      // without waiting in the queue
      try {
        const tradeData = JSON.parse(data);
        // console.log(`${symbols} için gelen veriler:`, tradeData);

        const timestamp = Date.now();
        const tradeDataObject = {...tradeData.data, timestamp,}; //stream included binance url sends object list has two elements "stream and data".

        // binanceWebSocketTradesData[symbols].push(tradeDataObject);

        // WriteTradesDataValues(String(tradeDataObject.s).toLowerCase(), tradeDataObject); // attention
        const symbol = String(tradeDataObject.s).toLowerCase();
        if (!binanceWebSocketTradesData[symbol]) { 
          binanceWebSocketTradesData[symbol] = []; 
        }
        binanceWebSocketTradesData[symbol].push(tradeDataObject);

        // clean4hOldTrades(symbols);

        // console.log("Güncel veri : ", binanceWebSocketTradesData[symbols]);
      }
      catch (error) {
        console.error('WebSocket trades verisi ayrıştırılamadı:', error);
      }
    });



    // let StartLogBitcoinFetchedPerSecond = true;
    // function LogBitcoinFetchedPerSecond() {
    //   let totalMessagesInSecond = [];
    //   setInterval(() => {
    //     let length = 0;
    //     // const vals = Object.values(binanceWebSocketTradesData);
    //     // for (const obj of vals) {
    //     //     length++;
    //     // }

    //     for (const key in binanceWebSocketTradesData) {
    //       if (binanceWebSocketTradesData.hasOwnProperty(key)) {
    //           console.log(`Key: ${key}`);
              
    //           // Liste elemanlarını gezmek için
    //           binanceWebSocketTradesData[key].forEach(item => {
    //               // console.log(` - ${Object.values(item)}`);
    //               length++;
    //           });
    //       }
    //   }

    //   console.log(length);
    //   binanceWebSocketTradesData = {};
    //   // console.log(binanceWebSocketTradesData);
    //   }, 1000);
    // }

    ws.on('error', (err) => {
      console.error(`${symbols} WebSocket hatası:`, err);
      DeatachFromWSConnectionsList(ws);
      reject(err); // Hata oluşursa reject ediyoruz
    });

    ws.on('close', (code, reason) => {
      console.log(`${symbols} WebSocket bağlantısı "${code}, ${reason}" sebebi ile kapandı.`);

      DeatachFromWSConnectionsList(ws);

      // dont run below lines while resetting
      if (FetchingDataResetting)
        return;

      const symbolValue = symbols;
      // console.log("symbol val : ", symbolValue);
      fetchTradeDataForSymbol(symbolValue)
        .then(result => {
          console.log(`${symbolValue} Bağlantısı tekrar kuruldu.`);
        })
        .catch(err => {
          console.error("Tekrar bağlanılamadı, hata: ", err);
        });

    });

    function DeatachFromWSConnectionsList(wsconnection) {
      const index = wsConnections.indexOf(wsconnection);
      wsConnections.splice(index, 1);
    }

  });
};

// Tüm semboller için paralel WebSocket bağlantıları başlatıyoruz
const fetchAllTradeData = async () => {
  try {
    if (!InitialFiltrationCompleted) {
      await InitialFiltration();
    }

    // Tüm semboller için veri çekme işlemini paralel olarak başlatıyoruz
    console.log("fetching threads : ", FetchingThreads);
    let promises = [];

    for (const key in FetchingThreads) {
      const symbolList = FetchingThreads[key];
      if (symbolList != "")
        promises.push(fetchTradeDataForSymbol(symbolList));
      else
        console.log(`Symbols of the ${key} to be fetched are null or empty.`);
    }

    // const tradeDataPromises = FetchingThreads.map((symbol) => fetchTradeDataForSymbol(symbol));
    const tradeDataPromises = promises;
    // Tüm verileri bekliyoruz
    const allTradeData = await Promise.all(tradeDataPromises)
      .then(results => {
        results.forEach(result => console.log(`${result} Bağlantısı kuruldu.`)); // Sonuç
      })
      .catch(err => {
        console.error(err); // Hata aldığında her bir işlem kendi hata mesajı ile sonuçlanacak
      });

    // console.log('Tüm ticaret verileri:', allTradeData);
  } catch (error) {
    console.error('Bir hata oluştu:', error);
  }
};

// Veriyi çekme işlemini başlatıyoruz
fetchAllTradeData();

// !!! this function may being security vulnerable when this application started on a web server !!!
async function ResetFetchingData() {

  if (FetchingDataResetting)
  {
    console.log("Already resetting... Please wait.");
    return;
  }
  
  FetchingDataResetting = true;

  function closeConnection(ws) {
    return new Promise((resolve, reject) => {
      // Bağlantı kapanınca resolve ile işlemi tamamla
      ws.on('close', () => {
        console.log('Bağlantı resetlendi, yeni bağlantı başlatılabilir.');
        resolve();
      });
      // Bağlantı kapanma hatası olursa reject ile hata mesajı ver
      ws.on('error', (err) => {
        console.error('Bağlantı hatası:', err);
        reject(err);
      });
  
      // WebSocket'i güvenli şekilde kapat
      ws.close(1000, "resetting");
    });
  }

  const ConstantWSConnections = Array.from(wsConnections); //thats because values are changed and new connections will be added during close events.

  for (const connection of ConstantWSConnections) {
    try {
      console.log("awaiting current connection resetting... state:", connection.readyState);
      await closeConnection(connection);
    }
    catch (error) {
      console.log("sunucuyu kapatma sırasında beklenmeyen bir hata meydana geldi : ", error);
    }
  }

  wsConnections = [];

  //start again
  await fetchAllTradeData();

  FetchingDataResetting = false;
}

function WriteTradesDataValues(symbol, data)
{
  if (Object.prototype.hasOwnProperty.call(binanceWebSocketTradesData, symbol)) {
    binanceWebSocketTradesData[symbol].push(data);
    // clean4hOldTrades(symbol);
  }
  else {
    binanceWebSocketTradesData[symbol] = [data];
  }

}

function clean4hOldTrades(symbol) {
  const fourHoursInMilliseconds = 4 * 60 * 60 * 1000; // 4 saat = 4 * 60 * 60 * 1000 ms

  const currentTime = Date.now();

  // "trades" dizisindeki her bir öğeyi kontrol ediyoruz ve 4 saatten eski olanları siliyoruz
  binanceWebSocketTradesData[symbol] = binanceWebSocketTradesData[symbol].filter((trade) => currentTime - trade.timestamp <= fourHoursInMilliseconds);

  // console.log('4 saatten eski veriler silindi. Kalan işlem verisi:', binanceWebSocketTradesData[symbol].length);
}

let CleanOldTradesInterval;
function StartCleanOldTradesInterval() {

  const fourHoursInMilliseconds = 4 * 60 * 60 * 1000; // 4 saat = 4 * 60 * 60 * 1000 ms

  //check if already started, consider first start
  if (CleanOldTradesInterval) {
    return;
  }
  
  CleanOldTradesInterval = setInterval(() => {

    const currentTime = Date.now();
    const symbols = Object.keys(binanceWebSocketTradesData);

    for (const symbol of symbols) {
      binanceWebSocketTradesData[symbol] = binanceWebSocketTradesData[symbol].filter((trade) => currentTime - trade.timestamp <= fourHoursInMilliseconds);
    }

  }, fourHoursInMilliseconds);
}
function StopCleanOldTradesInterval() {
  if (CleanOldTradesInterval) {
     clearInterval(CleanOldTradesInterval);
  }
}


// Sunucu kapatıldığında tüm bağlantıları kapat
process.on('SIGINT', () => {
  console.log('Sunucu kapatılıyor...');

  const ConstantWSConnections = Array.from(wsConnections); //thats because values are changed and new connections will be added during close events.

  for (const connection of ConstantWSConnections) {
    if (connection.readyState === WebSocket.OPEN)
      connection.close(1000, "shutdown");
  }

  wsConnections = [];

  process.exit(0);
});

/*example trades data
{
  "e": "trade",                  // Event tipi, bu durumda 'trade' olduğunu belirtir
  "E": 1617756342365,             // Sunucu zamanı (timestamp)
  "s": "BTCUSDT",                 // Ticaret çifti
  "t": 12345678,                  // İşlem ID'si (her ticaret için benzersiz bir kimlik)
  "p": "58000.00",                // Ticaret fiyatı (USDT cinsinden)
  "q": "0.01",                    // Ticaret miktarı (BTC cinsinden)
  "b": 654321,                    // Alıcı emir ID'si
  "a": 123456,                    // Satıcı emir ID'si
  "T": 1617756342364,             // Ticaretin gerçekleştiği zaman
  "m": false,                     // `true` ise alıcı "maker", `false` ise "taker"
  "M": true                       // Bu ticaretin "market maker" olup olmadığını gösterir (genellikle `true`)
}

*/


// wsTrades.on('open', () => {
//   console.log("Binance Websocket Trades bağlantısı kuruldu.");
// });
// wsTrades.on('message', (data) => {
//   try {
//     const trade = JSON.parse(data);

//     // const date = new Date(trade.T);
//     // console.log(`Son BTC/USDT Güncel Fiyatı: ${trade.P}, İşlem zamanı: ${date}`); // `c` son fiyatı temsil eder

//     const timestamp = Date.now();
//     const tradeData = {...trade, timestamp,};

//     binanceWebSocketTradesData.push(tradeData);

//     clean4hOldTrades();

//     console.log("Güncel veri uzunluğu : ", binanceWebSocketTradesData.length);
//   }
//   catch (error) {
//     console.error('WebSocket trades verisi ayrıştırılamadı:', error);
//   }
//   // const ticker = JSON.parse(data);
// });
// wsTrades.on('error', (err) => {
//   console.error('WebSocket trades Hatası:', err);
// });
// wsTrades.on('close', () => {
//   console.log('WebSocket trades bağlantısı kapandı. Yeniden bağlanmayı düşünebilirsiniz.');
// });


// function clean4hOldTrades() {
//   const fourHoursInMilliseconds = 4 * 60 * 60 * 1000; // 4 saat = 4 * 60 * 60 * 1000 ms

//   const currentTime = Date.now();

//   // "trades" dizisindeki her bir öğeyi kontrol ediyoruz ve 4 saatten eski olanları siliyoruz
//   binanceWebSocketTradesData = binanceWebSocketTradesData.filter((trade) => currentTime - trade.timestamp <= fourHoursInMilliseconds);

//   console.log('4 saatten eski veriler silindi. Kalan işlem verisi:', binanceWebSocketTradesData.length);
// }

// <Binance websocket data


//EXPRESS DATA>

app.use(express.static('public')); // old - app.use(express.static(path.join(__dirname, 'public')));

// app.get('/', function (req, res) {
//   res.send('Hello World')
// })

//WS CONNECTIONS>

var BinanceMarketsWSFormat = [];

app.get('/api/ws/binance', async function (req, res) { ///api/ws/binance - ws

  try {
    if (binanceWebSocketTradesData) {
      const symbol = req.query.symbol;

      const correctedSymbol = symbol.replace("/", "").toLowerCase();

      // console.log(correctedSymbol);

      res.json(binanceWebSocketTradesData[correctedSymbol]);

      // console.log(binanceWebSocketTradesData[correctedSymbol]);
    }
    else {
      res.status(503).json({ error: 'Veri henüz mevcut değil. Lütfen daha sonra tekrar deneyin.' });
    }
  }
  catch (error) {
    console.error('binance verileri çekme sırasında bir hata meydana geldi: ', error);
  }
})

app.get('/api/ws/binance/fetchingsymbols', async function (req, res) {
  try {
    if (WsSymbolsToFetch) {
      res.json(WsSymbolsToFetch);
    }
    else {
      res.status(503).json({ error: 'Sembol verisi henüz mevcut değil. Lütfen daha sonra tekrar deneyin.' });
    }
  }
  catch (error) {
    console.error('binance sembol verisi sırasında bir hata meydana geldi: ', error);
  }
});

// !!! This method causes security issues when the site is run on the server instead of a local host usage. !!!
// tells the server to stop fetching a coin
app.get('/api/ws/binance/stopfetch', async function (req, res) {
  try {
    const symbol = String(req.query.symbol);

    // console.log("disabling fetch: ", symbol);
    // console.log('type: ', typeof(symbol));

    const index = WsSymbolsToFetch.indexOf(symbol);

    if (index > -1) {
      WsSymbolsToFetch.splice(index, 1);
    }

    res.send("Confirmed.")

    // console.log(WsSymbolsToFetch);
  }
  catch (error) {
    console.error('enable fetch işlemi sırasında bir hata meydana geldi: ', error);
  }
});

app.get('/api/ws/binance/enablefetch', async function (req, res) {
  try {
    const symbol = String(req.query.symbol);

    // console.log("enabling fetch:", symbol);
    // console.log('type: ', typeof(symbol));

    await FetchMarketsInternal();

    FormatBinanceMarketDataToWS();

    const included = BinanceMarketsWSFormat.includes(symbol); //check if inputted coin is .available
    // console.log(BinanceMarketsWSFormat);

    if (included) {
      if (!WsSymbolsToFetch.includes(symbol)) {
        WsSymbolsToFetch.push(symbol);
        WsSymbolsToFetch.sort((a, b) => a.localeCompare(b));
      }
    }

    res.send("Confirmed.")

    // console.log("new fetching data: ", WsSymbolsToFetch);
  }
  catch (error) {
    console.error('enable fetch işlemi sırasında bir hata meydana geldi: ', error);
  }
});

app.get('/api/ws/binance/firstfetchetvalue', async function (req, res) {

  try {
    if (binanceWebSocketTradesData) {
      const symbol = req.query.symbol;
      const correctedSymbol = symbol !== undefined && symbol !== null ? symbol.replace("/", "").toLowerCase() : null;

      if (symbol !== null && symbol !== undefined){
        res.json(binanceWebSocketTradesData[correctedSymbol][0]);
      }
      else {
        let earliestTimestamp = Infinity;
        let earliestTrade = null;
        const keys = Object.keys(binanceWebSocketTradesData);
        for (let key in binanceWebSocketTradesData) {
          let firstElement = binanceWebSocketTradesData[key][0];

          if (firstElement !== undefined && firstElement !== null &&
            firstElement.timestamp !== undefined && firstElement.timestamp !== null)
          {
            // console.log(key, " keyinde undefined değer : ", firstElement);
            // console.log(firstElement.timestamp);
            // console.log("tpye : ",typeof(firstElement.timestamp));
            // Eğer mevcut timestamp, en küçük timestamp'tan küçükse güncelle
            if (firstElement.timestamp < earliestTimestamp) {
              earliestTimestamp = firstElement.timestamp;
              earliestTrade = firstElement;
            }
          }
          else if (key == keys[keys.length - 1])
          {
            const errorValue = {timetamp: "TIMETAMP CANT PULLED BECAUSE IT'S NULL"};
            res.json(errorValue);
            return;
          }
        }

        res.json(earliestTrade);
        // console.log("earliest trade sended :", earliestTrade);
      }
    }
  }
  catch (error) {
    console.error('binance ilk depolanan veriyi çekme sırasında bir hata meydana geldi: ', error);
  }

});

app.post('/submitSelectedCoins', async function (req, res) {
  const receivedData = req.body.data;
  const hasDisabledCoin = req.body.hasDisabledCoin;
  console.log("sunucudan gelen coin listesi veri : ", receivedData);

  // res.json({ message: 'Veri başarıyla alındı!' });

  if ((receivedData == "" || typeof receivedData !== "string") && !hasDisabledCoin) {
    res.json({ message: 'Boş veya anlamsız girdi.' });
    return;
  }

  let correctedData = receivedData;
  let returningData = receivedData;
  const dataToArray = receivedData.split(",");

  await FetchMarketsInternal();

  FormatBinanceMarketDataToWS();

  let usableSymbols = dataToArray.length;

  //check if there are invalids
  for (const element of dataToArray) {
    const included = binanceMarkets.includes(element.toUpperCase()); //check if inputted coin is .available
    // console.log(BinanceMarketsWSFormat);

    if (!included) {
      returningData = returningData.replace(element, `(GEÇERSİZGİRDİ:${element})`);
      usableSymbols--;
    }
  }

  if (usableSymbols <= 0 && !hasDisabledCoin) {
    res.json({ message: 'Girilen tüm veriler anlamsız.' });
    return;
  }

  for (const element of dataToArray) {
   
    // console.log(BinanceMarketsWSFormat);

    const correctedToWsFormat = element.replace(/\//g, '').toLowerCase();
    const included = BinanceMarketsWSFormat.includes(correctedToWsFormat); //check if inputted coin is .available

    if (included) {
      if (!WsSymbolsToFetch.includes(correctedToWsFormat)) {
        WsSymbolsToFetch.push(correctedToWsFormat);
      }
    }

  }

  WsSymbolsToFetch.sort((a, b) => a.localeCompare(b));

  console.log("resetting connections...");

  res.json({ message: 'Veri başarıyla alındı!', returningSymbols : returningData });

  ResetFetchingData();

});

app.get('/WSConnectionsAreReady', async function (req, res) {
  let allConnectionsReady = true;
  if (wsConnections.length >= 0) {
    for (const ws of wsConnections) {
      try {
        if (ws.readyState !== WebSocket.OPEN) {
          allConnectionsReady = false;
        }
      }
      catch {
        allConnectionsReady = false;
      }
    }
  }
  else {
    allConnectionsReady = false;
  }
  res.json(allConnectionsReady);

  console.log(wsConnections.length);
});

// <WS CONNECTİONS

// COMMON CONNECTIONS>

function FormatBinanceMarketDataToWS() {
  try {
    const cleanedPaths = binanceMarkets.map(path => path.replace(/\//g, '').toLowerCase());
    BinanceMarketsWSFormat = cleanedPaths;
  }
  catch (error) {
    console.log("CCXT ile çekilen market verilerini WS formatında yeniden yapılandırırken hata meydana geldi: ", error);
  }

}

// <COMMON CONNECTIONS


//REST API Connections>

const binance = new ccxt.binance({
  enableRateLimit: true, // Hız sınırına uygun çalışmayı etkinleştir
});

app.get('/api/ccxt/tickers', async function (req, res) { ///api/ws/binance - ws

  // REST API connection
  const symbol = req.query.symbol;
  // const testlist = ['Elma', 'Armut', 'Muz', 'Kiraz', 'Portakal', `${Symbol}`];
  // res.json(testlist);
  // const symbol = req.query.symbol;
  console.log(symbol);
  try {
    const ticker = await binance.fetchTicker(`${symbol}`); //old is symbol
    res.json(ticker);
    // console.log("json test requested");
  }
  catch (error) {
    console.log("ticker cant get due to an error : ", error);
    res.status(404).json('ticker  cant be fetched due to an error.');
  }
})

app.get('/api/ccxt/trades', async function(req, res) {
  const symbol = req.query.symbol;
  const since = req.query.since;

  // const since = new Date(req.query.since);

  try {
    const trades = await binance.fetchTrades(`${symbol}`, since != undefined && since != 'undefined' ? Number(since) : undefined, 1000);
    res.json(trades);
    // console.log("json trades requested");
  }
  catch (error) {
    console.error('Binance REST API işlem çekme sırasında bir hata oluştu :  ', error);
  }
});

var binanceMarkets = [];
let marketsFetched = false;
app.get('/api/ccxt/markets', async function (req, res) { ///api/ws/binance - ws

  if (!marketsFetched){
    const fetchingmarkets = await binance.loadMarkets(); //old is symbol
    binanceMarkets = Object.keys(fetchingmarkets);
    marketsFetched = true;
  }
  const marketsjson = binanceMarkets;
  if (marketsjson)
    res.json(marketsjson);
  else
    res.status(404).json('markets cant be fetched due to an error.');
  // console.log("markets requested");
  
})

async function FetchMarketsInternal(){
  if (!marketsFetched){
    const fetchingmarkets = await binance.loadMarkets(); //old is symbol
    binanceMarkets = Object.keys(fetchingmarkets);
    marketsFetched = true;
  }
}
FetchMarketsInternal(); //start fetching at start of the server

//<REST API Connections

// app.get('/test', function (req, res) {
//   res.send('testing');
// })

// app.use(cors());

app.listen(PORT, () => {
    console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
    // console.log (ccxt.exchanges)
});

//<EXPRESS DATA


//old
// const server = http.createServer((req, res) => {
//   res.statusCode = 200;
//   res.setHeader("Content-Type", "text/plain");
//   res.end("Hello World\n");
// });

// server.listen(PORT, () => {
//   console.log(`Server running at http://localhost:${PORT}/`);
// });