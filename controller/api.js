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
    console.log("req.body==>",  req.body);
     console.log("req.body.id==>",  req.body.id);
     let formattedDateTime = returnFormattedCurrentDate()
    const user = await UserModel.create({
      userId: req.body.id,
      date :formattedDateTime
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

    let doesUserExist = await UserModel.findOne({userId:req.body.id})

    if(!doesUserExist){
       let formattedDateTime = returnFormattedCurrentDate()
      const user = await UserModel.create({
      userId: req.body.id,
      date :formattedDateTime
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
    }

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
Format the following plain text into clean, structured HTML using appropriate tags like <p>, <br>, <strong>, <em>, <h4>–<h6>, <mark>, etc., to enhance readability and structure.

If any part of the text is not in the English alphabet (e.g., written in Hindi, Arabic, etc.), transliterate it to English letters (Roman script). For example, change 'कैसे हो' to 'kaise ho'.

⚠️ Do not wrap the output in any markdown-style code blocks. Just return plain raw HTML with no extra commentary.

Text:
${response}
      `.trim(),
    },
  ],
});

let html = formatData.choices[0].message.content.trim();

// Remove ```html and ``` if they exist
if (html.startsWith("```html")) {
  html = html.replace(/^```html/, "").replace(/```$/, "").trim();
}
    res.send({
      response:html,
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

    let doesUserExist = await UserModel.findOne({userId:req.body.id})

    if(!doesUserExist){
       let formattedDateTime = returnFormattedCurrentDate()
      const user = await UserModel.create({
      userId: req.body.id,
      date :formattedDateTime
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
    }
    let doc = await UserDataModel.findOne({ userId: req.body.uid });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: `
Based on the following text, generate a LinkedIn-ready post. 
- Try to understand the intent of the text and why and how an individual will post it on their personal linkedin profile.
- Do not include any commentary or explanations—only return the final post content.
- Use full-width Unicode formatting:
  - Convert all text wrapped in **double asterisks** to Unicode bold (𝗹𝗶𝗸𝗲 𝘁𝗵𝗶𝘀).
  - Convert all text wrapped in *single asterisks* to Unicode italic (𝘭𝘪𝘬𝘦 𝘵𝘩𝘪𝘴).
- No markdown or HTML should remain in the result.
- Keep hashtags relevant and trending.
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
    let doesUserExist = await UserModel.findOne({userId:req.body.id})

    if(!doesUserExist){
       let formattedDateTime = returnFormattedCurrentDate()
      const user = await UserModel.create({
      userId: req.body.id,
      date :formattedDateTime
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
    }
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

const formattedCompletion = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    {
      role: "user",
      content:  `
Format the following plain text into clean, structured HTML using appropriate tags like <p>, <br>, <strong>, <em>, <h4>–<h6>, <mark>, etc., to enhance readability and structure.

⚠️ Do not wrap the output in any markdown-style code blocks (like \`\`\`html). Just return plain raw HTML with no extra commentary.

Text:
${completion.choices[0].message.content}
        `.trim(),
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
        response: formattedCompletion.choices[0].message.content,
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
   await removeCopyUserIDs()
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

function createDummyPaymentLink(req,res) {
  let {appointmentId, totalPrice, customerId} = req.body
  const baseUrl = "https://dummy-payment.com/pay";

  const queryParams = new URLSearchParams({
    appointmentId: appointmentId,
    amount: totalPrice,
    customerId: customerId,
    currency: "USD"
  });

  let url =  `${baseUrl}?${queryParams.toString()}`;

  return res.status(200).send({paymetnLink:url})
}


async function removeCopyUserIDs(){
  try{
    let allDocs = await UserModel.find({}).sort("createdAt")
    let doesDocExist = []
    for(let x = 0;x<allDocs.length;x++){
      if(doesDocExist.includes(allDocs[x].userId)){
        let userId = allDocs[x].userId
        await UserModel.deleteOne({_id:allDocs[x]._id})
        console.log("deleted id==>",userId)

      }
      else{
      let userId = allDocs[x].userId
        doesDocExist.push(allDocs[x].userId)
        console.log("pushed userID==>",userId)
      }
    }
        console.log("Duplicate users removed successfully.");
  }
  catch(e){
    console.log("e==>",e)
  }
}







module.exports = {
  createUser,
  audioTranscription,
  convertTextToLinkedinContent,
  enhanceText,
  increaseUsageLimit,
  createDummyPaymentLink
};



function returnFormattedCurrentDate(){
  const now = new Date();

// Get date components
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
const day = String(now.getDate()).padStart(2, '0');

// Get time components
const hours = String(now.getHours()).padStart(2, '0');
const minutes = String(now.getMinutes()).padStart(2, '0');
const seconds = String(now.getSeconds()).padStart(2, '0');

// Example format: YYYY-MM-DD HH:MM:SS
const formattedDateTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
return formattedDateTime
}