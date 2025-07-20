const { createUser, audioTranscription, convertTextToLinkedinContent, enhanceText ,increaseUsageLimit, createDummyPaymentLink} = require("../controller/api");
const { doesUserExist,verifyAppCheck } = require("../authentication/auth");
const multer = require("multer");
const path = require("path");

// Define storage before using it
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + "-" + Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

const routes = (app) => {
  app.post("/user", createUser);
  app.post("/uploadFile", [ upload.single("file")], audioTranscription);
  app.post("/linkedinShareableText", convertTextToLinkedinContent);
  app.post("/enhanceText",enhanceText)
  app.post("/increase",increaseUsageLimit)
  app.post("/dummyPaymentLink",createDummyPaymentLink)
};

module.exports = routes;
