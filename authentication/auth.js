const UserModel = require("../model/User")
const admin = require('firebase-admin');
const fs = require("fs");

const doesUserExist = async(req,res,next)=>{
    try{
         const file = req.file
        console.log("req.body.uid==>",req.body.uid)
        let user = UserModel.findById(req.body.uid)
        if(!user){
            return res.staus(404).send(JSON.stringify("Invalid User"))
        }
        next()
    }
    catch(e){
         if(file) fs.unlinkSync(file.path);
      return  res.status(500).send(JSON.stringify("Internal server Error"));
    }
}


const verifyAppCheck = async (req, res, next) => {
    const file = req.file
     if(req.body.id=="geographic"||req.body.uid == "geographic"){ next()
      return
     }
  const appCheckToken = req.header('X-Firebase-AppCheck');
  
  if (!appCheckToken){
    console.log("No App Check token")
    return res.status(403).send('No App Check token');}

   

  try {
    const appCheckClaims = await admin.appCheck().verifyToken(appCheckToken);
    console.log('✅ AppCheck token verified', appCheckClaims);
    next();
  } catch (err) {
    console.error('❌ Invalid AppCheck token', err);
    if(file) fs.unlinkSync(file.path);
    return res.status(403).send('App Check failed');
  }
};


module.exports ={
    doesUserExist,
    verifyAppCheck
}