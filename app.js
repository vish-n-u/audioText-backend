const speech = require("@google-cloud/speech");
const express = require("express");
const fs = require("fs");
const app = express();
const multer = require("multer");
const mongoose = require("mongoose");

// Creates a client
const client = new speech.SpeechClient();
const path = require("path");
const dotenv = require("dotenv");
dotenv.config();
app.use(express.json())
async function startApp() {
  try {
    let uri = process.env.mongodbConnect;

    console.log("uri==>", uri);

    await mongoose.connect(uri);

    const route = require("./route/route.js");
    route(app);
     fs.access("uploads",fs.constants.F_OK,(err)=>{
      if(err){
        fs.mkdirSync("uploads")
      }
      
    })

    require("./route/route.js")(app);
    app.listen(3000, () => {
      console.log("listening....");
    });
  } catch (e) {
    console.log("e.message==>", e.message, e);
  }
}


startApp();

async function quickstart(inputFile) {
  // The path to the remote LINEAR16 file
  const filename = inputFile || "./uploads/file-1723966600095.pcm";
  const encoding = "LINEAR16";
  const sampleRateHertz = 16000;
  const languageCode = "en-US";

  const config = {
    encoding: encoding,
    languageCode: languageCode,
    useEnhanced: true,
    model: "phone_call",
  };
  const audio = {
    content: fs.readFileSync(filename).toString("base64"),
  };

  const request = {
    config: config,
    audio: audio,
  };

  // Detects speech in the audio file
  const [response] = await client.recognize(request);
  let data = "";
  console.log("response==>", response);
  const transcription = response.results
    .map((result) => result.alternatives[0].transcript)
    .join("\n");
  console.log(`transcription: ${transcription}`);
  return transcription;
}

// function convertPcmToWav(inputFilePath, outputFilePath, sampleRate, channels, bitDepth) {
//     // Read the PCM file
//     const pcmData = fs.readFileSync(inputFilePath);

//     // Convert the PCM data to the appropriate format
//     let audioData;
//     if (bitDepth === 16) {
//         // 16-bit PCM data
//         audioData = new Int16Array(pcmData.buffer);
//     } else if (bitDepth === 8) {
//         // 8-bit PCM data
//         audioData = new Int8Array(pcmData.buffer);
//     } else {
//         throw new Error('Unsupported bit depth');
//     }

//     // Create channel data
//     const channelData = [];
//     for (let i = 0; i < channels; i++) {
//         channelData.push(new Float32Array(audioData.length / channels));
//     }

//     // Deinterleave the audio data
//     for (let i = 0; i < audioData.length; i++) {
//         const channel = i % channels;
//         const index = Math.floor(i / channels);
//         channelData[channel][index] = audioData[i] / (bitDepth === 16 ? 32768 : 128);
//     }

//     // Define WAV file properties
//     const wavData = {
//         sampleRate: sampleRate,
//         channelData: channelData
//     };

//     // Encode PCM data to WAV format
//     wavEncoder.encode(wavData).then((buffer) => {
//         // Write the WAV file
//         fs.writeFileSync(outputFilePath, Buffer.from(buffer));
//         // quickstart(outputFilePath)
//     }).catch((error) => {
//         console.error('Error during conversion:', error);
//     });
// }

// Usage

// Example usage
// convertPcmToWav('./uploads/file-1723916096625.pcm', 'output.wav');
