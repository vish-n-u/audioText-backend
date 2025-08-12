const UserModel = require("../model/User");
const UserDataModel = require("../model/UserData");
const speech = require("@google-cloud/speech");
const WavDecoder = require("wav-decoder");
const nodemailer = require("nodemailer")
const admin = require("firebase-admin");
const ffmpeg = require("fluent-ffmpeg") 
const fs = require("fs");
const OpenAI = require("openai");
const openai = new OpenAI({
  apiKey: process.env.apiKey,
})


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
     let timestampsRaw = req.timestamps || req.body.timestamps;
    console.log("[audioTranscription] ✅ Raw timestamps:", timestampsRaw);

    let timestampsInMs = [];

    if (timestampsRaw&&timestampsRaw !== "null") {
      timestampsInMs = timestampsRaw
        .split(",")
        .map((elem) => elem.trim())
        .filter((elem) => elem && elem !== "null")
        .map((sec) => Number(sec) * 1000)
        .filter((ms) => !isNaN(ms))
        .sort((a, b) => a - b);

      console.log("[audioTranscription] ✅ Timestamps in ms:", timestampsInMs);
    } else {
      console.log("[audioTranscription] ⚠️ No timestamps provided");
    }
   

    console.log("reached here==>")

    const buffer = await readFile(file.path);
    // const audioData = await WavDecoder.decode(buffer);

    // const audioDurationInSec = audioData.channelData[0].length / audioData.sampleRate;

    let doesUserExist = await UserModel.findOne({userId:req.body.uid})

    if(!doesUserExist){
       let formattedDateTime = returnFormattedCurrentDate()
      const user = await UserModel.create({
      userId: req.body.uid,
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
    const newUsedTime = Number(data.usedTranscriptionTimeInMilliSec) + 60 * 1000;

    if (newUsedTime > data.totalTranscriptionTimeInMilliSec && false) {
      throw new Error("Transcription quota exceeded");
    }

    console.log("[audioTranscription] 🎬 Starting FFmpeg splitting...");

    const inputPath = file.path;
    const outputChunks = [];
    const splitPoints = timestampsInMs;

    const points = [0, ...splitPoints];
    const chunkPairs = [];

    for (let i = 0; i < points.length; i++) {
      const startMs = points[i];
      const endMs = points[i + 1] || null; // null = end
      chunkPairs.push({ startMs, endMs });
    }

    console.log("[audioTranscription] 📌 Split pairs:", chunkPairs);

    const outputDir = path.join(process.cwd(), "chunks");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    // 🔹 Promise all splits in series (these must run in sequence, but you could parallelize with caution)
    for (let i = 0; i < chunkPairs.length; i++) {
      const { startMs, endMs } = chunkPairs[i];
      const outputPath = path.join(outputDir, `chunk_${i + 1}.mp3`);

      await new Promise((resolve, reject) => {
        let cmd = ffmpeg(inputPath)
          .setStartTime(startMs / 1000);

        if (endMs) {
          const durationSec = (endMs - startMs) / 1000;
          cmd = cmd.setDuration(durationSec);
        }

        cmd
          .output(outputPath)
          .on("end", () => {
            console.log(`[audioTranscription] ✅ Created ${outputPath}`);
            outputChunks.push(outputPath);
            resolve();
          })
          .on("error", (err) => {
            console.error(`[audioTranscription] ❌ FFmpeg error: ${err}`);
            reject(err);
          })
          .run();
      });
    }

    console.log("[audioTranscription] ✅ All chunks created:", outputChunks);

    // 4️⃣ Transcribe all chunks concurrently
    console.log("[audioTranscription] ⚡ Transcribing chunks in parallel...");

    const transcriptionPromises = outputChunks.map((chunkPath, idx) => {
      console.log(`[audioTranscription] 🚀 Queued transcription for chunk ${idx + 1}`);
      return quickstart(chunkPath);
    });

    const transcripts = await Promise.all(transcriptionPromises);

    console.log("[audioTranscription] ✅ All chunk transcripts received:", transcripts);

    // 5️⃣ Clean up chunk files in parallel
    outputChunks.forEach((chunkPath) => {
      try {
        fs.unlinkSync(chunkPath);
      } catch (e) {
        console.warn(`[audioTranscription] ⚠️ Could not delete chunk: ${chunkPath}`);
      }
    });

    // 6️⃣ Stitch text + images
    let finalNote = "";
    for (let i = 0; i < transcripts.length; i++) {
      finalNote += transcripts[i] + "\n";
      if (i < splitPoints.length) {
        finalNote += `<img src=""/> \n`;
      }
    }


    console.log("transcription==>",response)

    data.usedTranscriptionTimeInMilliSec = String(newUsedTime);
    await data.save();
    console.log("filename==>",file.path)

    fs.unlinkSync(file.path);

const formatData = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    {
      role: "user",
      content: `
Format the following plain text into clean, structured HTML using appropriate tags like <p>, <br>, <strong>, <em>, <h4>–<h6>, <mark>, etc., to enhance readability **and preserve the natural spoken emphasis**.

If any parts of the text sound emotional, stressed, or strongly expressed, wrap them in <strong> or <em> tags to show emphasis. Use <mark> if something should stand out dramatically.

If any part of the text is not in the English alphabet (e.g., written in Hindi, Arabic, etc.), transliterate it to English letters (Roman script). For example, change 'कैसे हो' to 'kaise ho'.

Additionally, look for any text pattern that follows this format or something very similar:
"Insert image file here xx"

When you find this pattern, replace the entire phrase with:
<img src=""/>

Examples:
- "Insert image file here xx" becomes <img src=""/>

⚠️ Do not wrap the output in any markdown-style code blocks. Just return plain raw HTML with no extra commentary.

Text:
${finalNote}
      `.trim(),
    },
  ],
});



console.log("formatData==>",formatData.choices[0].message.content.trim())

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

    let doesUserExist = await UserModel.findOne({userId:req.body.uid})
    console.log("doesUserExist==>",doesUserExist)

    if(!doesUserExist){
      console.log("user does not exist")
    }
     if(doesUserExist){
      console.log("user does exist")
    }

    if(!doesUserExist){
       let formattedDateTime = returnFormattedCurrentDate()
      const user = await UserModel.create({
      userId: req.body.uid,
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
You are a LinkedIn writing assistant.

Rewrite the following text as if a real person is sharing it casually on their LinkedIn profile:
- Use a warm, conversational tone — imagine explaining it to a friend or peers.
- Add small human touches: rhetorical questions, tiny side notes, light humor.
- Emojis are fine if they fit naturally (just don’t overdo it).
- Keep it flowing — not like a textbook or corporate announcement.
- If it fits, open with something like “I was recently reading an article…” or “I came across this…” to make it feel personal.
- Preserve **bold** and *italic* by converting them to Unicode:
   - **bold** → 𝗯𝗼𝗹𝗱
   - *italic* → 𝘪𝘵𝘢𝘭𝘪𝘤
- End with a relatable sign-off or thought.
- Add 2–4 relevant hashtags.
- Do not include any explanations or markdown — just the final post.

Here are some examples:

---

Example 1  
Input:  
I learned about how DNS works today. DNS resolves domain names to IP addresses so we can visit websites easily.

Output:  
I was recently reading an article about 𝗗𝗡𝗦 — the unsung hero of the internet 🧩  
Ever typed in google.com and wondered *how* your browser knows where to go?  
Turns out, DNS quietly does the job of turning easy names into real IP addresses so we don’t have to memorize random numbers.  
It’s these tiny pieces that keep the web running smoothly — kind of cool, right?  
#TechBasics #DNS #CuriousMinds

---

Example 2  
Input:  
Emails use SMTP, IMAP, and POP3 protocols to send and receive messages between clients and servers.

Output:  
I came across this fun fact about emails today 📧  
Apparently, every time we hit “send”, SMTP, IMAP, and POP3 are working behind the scenes making sure our messages get where they need to go — no drama, no fuss.  
It’s like digital mailmen working 24/7 (and they never lose a package… hopefully).  
#EmailLife #TechNerd #Learning #EverydayTech

---

Now rewrite the following text in the same style:

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
    let doesUserExist = await UserModel.findOne({userId:req.body.uid})

    if(!doesUserExist){
       let formattedDateTime = returnFormattedCurrentDate()
      const user = await UserModel.create({
      userId: req.body.uid,
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