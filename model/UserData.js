const mongoose = require("mongoose")


const UserDataSchema = new mongoose.Schema({
    userId:String,
    usedTranscriptionTimeInMilliSec:String,
    totalTranscriptionTimeInMilliSec:String,
    usedNumberOfAiTextConversion:Number,
    totalNumberOfAiTextCoversion:Number


},{
    timestamp:true
})

const UserDataModel =  mongoose.model("userData",UserDataSchema)

module.exports = UserDataModel