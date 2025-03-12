const { createUser, audioTranscription, transformText } = require("../controller/api");
const { doesUserExist } = require("../authentication/auth");
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
  app.post("/uploadFile", [ upload.single("file"),doesUserExist], audioTranscription);
  app.post("/transformtext", transformText);
};

module.exports = routes;
