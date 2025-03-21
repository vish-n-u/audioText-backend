const UserModel = require("../model/User");
const UserDataModel = require("../model/UserData");
const speech = require("@google-cloud/speech");
const WavDecoder = require("wav-decoder");

const fs = require("fs");
const OpenAI = require("openai");
const openai = new OpenAI({
  apiKey: process.env.apiKey,
});

const readFile = (filepath) => {
  return new Promise((resolve, reject) => {
    fs.readFile(filepath, (err, buffer) => {
      if (err) {
        return reject(err);
      }
      return resolve(buffer);
    });
  });
};

const createUser = async (req, res) => {
  try {
    console.log("req.body==>", req, req.body);
    const user = await UserModel.create({
      userId: req.body.id,
    });
    await UserDataModel.create({
      userId: user.userId,
      usedTranscriptionTimeInMilliSec: "0",
      totalTranscriptionTimeInMilliSec: minToMillSecInString(5),
      linkedinTextConversionCount: 0,
      totalLinkedinTextConversionCount: 3,
      usedTextEnhanceCount: 0,
      totalTextEnhanceCount: 10,
    });
    console.log("User Created Successfully");
    return res.status(200).send(JSON.stringify("User Created Successfully"));
  } catch (e) {
    console.log("e==>", e);
    return res.status(500).send(JSON.stringify("Internal server Error"));
  }
};

const audioTranscription = async (req, res) => {
  try {
    const file = req.file;
    const outputPath = file.path;
    let data;
    let audioDurationInSec;
    await readFile(file.path)
      .then((buffer) => {
        return WavDecoder.decode(buffer);
      })
      .then(async function (audioData) {
        audioDurationInSec =
          audioData.channelData[0].length / audioData.sampleRate;
        let doc = await UserDataModel.findOne({ userId: req.body.uid });
        data = await doc.save();
      })
      .catch((e) => {
        console.log("e==>", e);
        throw Error("");
      });
    let usedtime =
      Number(data.usedTranscriptionTimeInMilliSec) + audioDurationInSec * 1000;
    console.log("audioDurationInSec==>", audioDurationInSec);
    console.log("time==>", usedtime);

    if (
      Number(data.usedTranscriptionTimeInMilliSec) + audioDurationInSec * 1000 >
      data.totalTranscriptionTimeInMilliSec + 60000
    ) {
      throw new Error("");
    }

    const response = await quickstart(outputPath);
    data.usedTranscriptionTimeInMilliSec = String(
      Number(data.usedTranscriptionTimeInMilliSec) + audioDurationInSec * 1000
    );
    await data.save();

    //   const response = "Dummy Data"

    fs.unlinkSync(file.path);
    console.log("response===>", response);

    res.send(
      JSON.stringify({
        response,
        Used_Transcription_Duration: data.usedTranscriptionTimeInMilliSec,
        Total_Transcription_Duration: data.totalTranscriptionTimeInMilliSec,
      })
    );
  } catch (e) {
    console.log("e==>", e.message, e);
    return res.status(500).send(
      JSON.stringify({
        response: "Internal server err",
        Used_Transcription_Duration: -1,
      })
    );
  }
};

const convertTextToLinkedinContent = async (req, res) => {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Based on this text :${req.body.text} provide me content that I can post on linkedin , add necessary hashtags and also just provide the content in unicode format so bolds and italics are retained that I can directly share`,
        },
      ],
      store: true,
    });

    console.log(completion.choices[0].message.content);
    res.status(200).send(JSON.stringify(completion.choices[0].message.content));
  } catch (e) {
    console.log("e==>", e, e.message);
    res.status(500).send(JSON.stringify("Internal server error"));
  }
};

async function enhanceText(req, res) {
  try {
    let doc = await UserDataModel.findOne({ userId: req.body.uid });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Enhance the following text :${req.body.text} add necessary formatting and bulleting if required, this data is going to be used as notes by the user , just provide the actual content , dont add any prefix or suffix like "Sure this is your enhanced text" the content needs to be directly useable.`,
        },
      ],
      store: true,
    });
    doc.usedTextEnhanceCount = doc.usedTextEnhanceCount + 1;
    const data = await doc.save();
    res.send(
      JSON.stringify({
        response: completion.choices[0].message.content,
        Used_Text_Enhance_Times: data.usedTextEnhanceCount,
        Total_Text_Enhance_Times: data.totalTextEnhanceCount,
      })
    );
  } catch (e) {
    console.log("e==>", e, e.message);
    res.status(500).send(JSON.stringify("Internal server error"));
  }
}

async function quickstart(inputFile) {
  if (!fs.existsSync(inputFile)) {
    console.error("Error: File does not exist ->", inputFile);
    throw new Error("");
    return;
  }

  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(inputFile),
    model: "whisper-1",
  });

  console.log("Transcription:", transcription);
  return transcription.text;
}

function minToMillSecInString(min) {
  let value = min * 60 * 1000;
  return `${value}`;
}

module.exports = {
  createUser,
  audioTranscription,
  convertTextToLinkedinContent,
  enhanceText
};
