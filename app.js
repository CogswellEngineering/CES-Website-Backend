
//Express set up
const express = require('express');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const cors = require('cors');

const app = express();

app.use(fileUpload());
app.use(bodyParser.urlencoded({extended:false}));
app.use(bodyParser.json());
app.use(bodyParser.text());
app.use(cors());


//Firebase admin set up
var admin = require('firebase-admin');


const credentials = {

  "project_id": process.env.FIREBASE_PROJECT_ID,
  "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
  "private_key": process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  "client_email": process.env.FIREBASE_CLIENT_EMAIL,
}

admin.initializeApp({

    credential: admin.credential.cert(credentials),
    databaseURL: "https://ceswebsite-cf841.firebaseio.com",
    storageBucket: "ceswebsite-cf841.appspot.com"
});

admin.firestore().settings({
    timestampsInSnapshots: true,
});

//Stripe set up
const stripe =  require("stripe")("sk_test_MWH2mjiatRAivWdPebpabXqj");

//Node mailer set up.
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport(

    {
     
     host:'smtp.gmail.com',
     secure:true,
     port:465,
     auth:{
         //This also needs to not be in version control, all bad man lol. Even the private repos in companies don't have
         //sensitive information like this.
         user:process.env.NOTIFIER_EMAIL,
         //Obviously, this needs to NOT just be here, but that's a different issue altogether.
         pass:process.env.NOTIFIER_PASSWORD,
     },

    } 
 );

const PORT = process.env.PORT || 5000; 
app.listen(PORT, () => {console.log("listening on port", PORT)});

module.exports =  {
    app,
    admin,
    emailer:transporter,
    stripe,
};