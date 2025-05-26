const UserModel = require("../model/User");
const UserDataModel = require("../model/UserData");
const speech = require("@google-cloud/speech");
const WavDecoder = require("wav-decoder");
const nodemailer = require("nodemailer")
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
    if (!file || !file.path) {
      return res.status(400).send({ response: "No file uploaded" });
    }

    const buffer = await readFile(file.path);
    const audioData = await WavDecoder.decode(buffer);

    const audioDurationInSec = audioData.channelData[0].length / audioData.sampleRate;

    const data = await UserDataModel.findOne({ userId: req.body.uid });
    const newUsedTime = Number(data.usedTranscriptionTimeInMilliSec) + audioDurationInSec * 1000;

    if (newUsedTime > data.totalTranscriptionTimeInMilliSec && false) {
      throw new Error("Transcription quota exceeded");
    }

    const response = await quickstart(file.path);

    data.usedTranscriptionTimeInMilliSec = String(newUsedTime);
    await data.save();

    fs.unlinkSync(file.path);

    const formatData = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: `
Format the following plain text into clean, structured HTML using appropriate tags like <p>, <br>, <strong>, <em>, <h1>–<h6>, <mark>, etc., to enhance readability and structure without changing any content or wording; output only valid HTML
Text:
${response}
        `.trim(),
        },
      ],
    });

    res.send({
      response: formatData.choices[0].message.content,
      Used_Transcription_Duration: data.usedTranscriptionTimeInMilliSec,
      Total_Transcription_Duration: data.totalTranscriptionTimeInMilliSec,
    });
  } catch (e) {
    console.error("Error in audioTranscription:", e.message || e);
    return res.status(500).send({
      response: "Internal server error",
      Used_Transcription_Duration: -1,
    });
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

const increaseUsageLimit = async (req,res)=>{
  try{
  const transporter = nodemailer.createTransport({
  service: "Gmail",
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: "ridescribenotes@gmail.com",
    pass:process.env.gmailPassword,
  },
});
 const info = await transporter.sendMail({
    from: 'ridescribenotes@gmail.com',
    to: "ridescribenotes@gmail.com",
    subject: "Increase Limit",
    text: req.body.text,
  });

  return res.status(200).send(JSON.stringify("success"))
}
catch(e){
   console.log("e==>", e, e.message);
    res.status(500).send(JSON.stringify(e.message));

}
}

module.exports = {
  createUser,
  audioTranscription,
  convertTextToLinkedinContent,
  enhanceText,
  increaseUsageLimit
};
