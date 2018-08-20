
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

//Stripe set up
const stripe =  require("stripe")("sk_test_MWH2mjiatRAivWdPebpabXqj");


module.exports =  {
    app,
    admin,
};