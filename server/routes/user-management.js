const {app, admin, emailer,} = require("../../app");
const {emailFooter } = require("../../email-templates");

//This will all be in config later.
const CES__HOME_URL = "http://localhost:3000/"

const UIDGenerator = require('uid-generator');
var userManager =  users.userManager();


//In previous version I didn't do verifying email, I'll do here though

app.post('/register',(req,res)=>{

    const body = req.body;
  
    const auth = admin.auth();
  
    auth.createUser({
      admin:false,
      email: body.email,
      emailVerified : true,
      password : body.password,
      displayName : body.firstName + " " + body.lastName,
      disabled:false,
      
    })
    .then(user => {
  
  
      const fireStore = admin.firestore();
      console.log("User",user.uid);
      const collectionRef = fireStore.collection('users').doc(user.uid);
      
      collectionRef.create(
        {
          displayName:body.displayName,
          email : body.email,
          firstName : body.firstName,
          lastName : body.lastName,
          major : body.major,
          credits : 0,
       })
       .then(val => {
         console.log(val);

         //Send success, then will check response, then send post request to send verification email.
         //I could call here, but semantics.
         res.send({success:true});
       })
      
      .catch(err =>{
  
        //If it fails then to remain consistent will also remove user from auth.
        auth.deleteUser(record.uid);
        res.send({error:"An error has occured. Please try again."});
      })
      
    })
    .catch(err => {
      console.log("err" + err.toString());
      if (err.toString() == "Error: The email address is already in use by another account."){
        console.log("I'm happening");
        res.send({error:"The email address is already in use by another account"});
      }
    })
    
});

//Making it it's own route, because if it fails to send upon registering, they can click button to send again.
//Don't need route for verifying that clicked, since logged in person should be verifying
//person(will check that on mount) then they'll have access to their own account.
//Will be verification in firestore.
app.post("/send_account_verification", async (req,res) => {

    const body = req.body;
    
    const email = body.email;


    const user = await admin.auth().getUserByEmail(email);

    if (user == null){

        //If this is sent, then need to check and ask them to register again
        //SHOULD NEVER HAPPEN, but for robustness sake.
        res.send({error:"No user with that email"});
    }
    

         //Sends verification, I could have it be another route, but will just be it getting success is true
         //then if true, sends verification email, if fails don't. Basically same thing happening here.
         //Scratch that, will be 

         //Don't need token or anything, actually. Just need to check the flag within auth if verified.
    const verificationLink = "'" + CES__HOME_URL + "/accounts/" + user.uid + "/verify";
    const mailOptions = {

        from: process.env.NOTIFIER_EMAIL,
        to: body.email,
            subject: "Email Verifcation",
            html: "<p> Hello, " + body.firstName + " " + body.lastName + "</p><br> \
            <p> Welcome to Cogswell Engineering Society Services </p> \
            <p> Please click <a href="+verificationLink+"> here </a> to verify your email address</p><br><br> \
            <br><p> If you did not create an account with us, you can ignore this email.</p>" +
            emailFooter,
            
    }
         
    emailer.sendMail(mailOptions)

        .then (resolution => {

            console.log("email sent");
            res.send({success:true});
        })
        .catch(err => {
            console.log("error", err);
            res.send({});
        });
 
});

