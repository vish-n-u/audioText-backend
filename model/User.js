const mongoose = require("mongoose")

const userSchema =new  mongoose.Schema({
    userId:String,
},{
    timestamps:true
})

const UserModel = mongoose.model("user",userSchema)
module.exports = UserModel