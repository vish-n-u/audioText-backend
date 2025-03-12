async function quickstart() {
    // The path to the remote LINEAR16 file
    const filename = './uploads/file-1723966600095.pcm';
  const encoding = 'LINEAR16';
  const sampleRateHertz = 16000;
  const languageCode = 'en-US';
  
  const config = {
    encoding: encoding,
    languageCode: languageCode,
    useEnhanced: true,
    model: 'phone_call',
  };
  const audio = {
    content: fs.readFileSync(filename).toString('base64'),
  };
  
  const request = {
    config: config,
    audio: audio,
  };
  
  // Detects speech in the audio file
  const [response] = await client.recognize(request);
  response.results.forEach(result => {
    const alternative = result.alternatives[0];
    console.log(alternative.transcript);
  });
    console.log(`response: ${response}`);
  }