const UserModel = require("../model/User");
const UserDataModel = require("../model/UserData");
const speech = require("@google-cloud/speech");
const WavDecoder = require("wav-decoder");
const admin = require("firebase-admin");

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
      totalLinkedinTextConversionCount: 10,
      usedTextEnhanceCount: 0,
      totalTextEnhanceCount: 10,
    });
    console.log("User Created Successfully");
    return res.status(200).send(JSON.stringify("User Created Successfully"));
  } catch (e) {
    console.log("e==>", e, e.errmsg, e.message);
    if (e.errmsg.includes("duplicate key error")) {
      console.log("inside here");
      return res.status(200).send(JSON.stringify("User Created Successfully"));
    }
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
    const formatData = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: `
Format the following plain text into clean, structured HTML using appropriate tags like <p>, <br>, <strong>, <em>, <h1>–<h6>, <mark>,>li>,<ol> etc., to enhance readability and structure without changing any content or wording; output only valid HTML , stricly just provide the data dont start with ``html
Text:
${response}
      `.trim(),
        },
      ],
      store: true,
    });

    


    console.log("finalText==>", formatData.choices[0].message.content);

    res.send(
      JSON.stringify({
       response: formatData.choices[0].message.content,
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
    let doc = await UserDataModel.findOne({ userId: req.body.uid });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: `
Based on the following text, generate a LinkedIn-ready post. 
- Write it as if it were written directly by a professional, with no introduction like "Certainly" or "Here's your post".
- Start with the actual post content immediately.
- Include relevant and trending hashtags where appropriate.
- Preserve formatting (e.g. **bold**, *italics*) using Unicode characters that render correctly on LinkedIn.
- Do NOT include any notes, explanations, or extra commentary—only return the final post content.

Text:
${req.body.text}
      `.trim(),
        },
      ],
      store: true,
    });

    console.log("doc==>", doc);
    console.log("text==>", req.body.text);
    console.log("finalText==>", completion.choices[0].message.content);
    doc.linkedinTextConversionCount = doc.linkedinTextConversionCount + 1;
    const data = await doc.save();

    console.log(completion.choices[0].message.content);
    res.status(200).send(
      JSON.stringify({
        response: completion.choices[0].message.content,
        linkedinTextConversionCount: data.linkedinTextConversionCount,
        totalLinkedinTextConversionCount: data.totalLinkedinTextConversionCount,
      })
    );
  } catch (e) {
    console.log("e==>", e, e.message);
    res.status(500).send(JSON.stringify("Internal server error"));
  }
};

async function enhanceText(req, res) {
  try {
    console.log("req.body.uid==>", req.body.uid);
    let doc = await UserDataModel.findOne({ userId: req.body.uid });
   const completion = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    {
      role: "user",
      content: `Improve the clarity, tone, and grammar of the following text. Do not add any formatting, bullet points, headings, or extra commentary. Return only the enhanced version of the text, ready to be used as clean, concise notes:\n\n${req.body.text}`,
    },
  ],
  store: true,
});

    console.log("doc==>", doc);
    doc.usedTextEnhanceCount = doc.usedTextEnhanceCount + 1;
    const data = await doc.save();
    console.log("doc==>2", doc, data);
    res.send(
      JSON.stringify({
        response: completion.choices[0].message.content,
        usedEnhanceTextCount: data.usedTextEnhanceCount,
        totalEnhanceTextCount: data.totalTextEnhanceCount,
      })
    );
  } catch (e) {
    console.log("e==>", e, e.message);
    res.status(500).send(JSON.stringify(""));
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
  enhanceText,
};
