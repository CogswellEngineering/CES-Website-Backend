const {app, admin, emailer,} = require("../../app");
const {emailFooter } = require("../../email-templates");

//This will all be in config later.
const CES__HOME_URL = "http://localhost:3000/"

const UIDGenerator = require('uid-generator');
const uidGenerator = new UIDGenerator();
const snooze = ms => new Promise(resolve => setTimeout(resolve, ms));




/*

    REGISTER ROUTES

*/

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
          role: "Member"
          verified: false,
       })
       .then(val => {

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



/*

    FORGOT PASSWORD ROUTES

*/



//Might replace this with firestore.
//Idk why I have the distinction of expired tokens vs invalid. actually pretty stupid.
app.get("/check-token",(req,res)=>{

    
    const token = req.query.token;


    //This checks if in expired
    //Auto expired if is
    //But also need to check if it's generated tokens
    //Otherwise I'm saying it worked without confirming that token even ever existed.
    
    const dbRef = admin.database().ref("ExpiredTokens/"+token);
    dbRef.once('value')
      .then(snapshot => {
        
        if (snapshot.exists()){
            res.send({expired:true});
        }
        else{

          //Prob do this in firestore instead tbh, it's ust better lol.
          //But fine for now, not big issue.
          const tokensRef = admin.database().ref("Tokens/"+token);

          tokensRef.once('value')
            .then (snapshot => {
              
              //More like invalid not expired but ye.
              if (!snapshot.exists()){
                res.send({expired:true});
                
              }
              else{

                res.send({expired:false});
              }

            })

        }
      })
      .catch(err => {

        console.log(err);
      })
  
})

//Token expired when used as in link visited and or run out of time, because expired 
//cause if expired then routes
app.post("/token-used",(req,res)=>{

    //This will remove the token, from tokens and push it into expired tokens.
    const token = req.body.token;
  
    const dbRef = admin.database();
  
    //Don't want to remove here, cause honestly it's dumb, cause then would have to copy, just need this to dis-allow repeated access.
    dbRef.ref("ExpiredTokens/"+token).push(token,val => {console.log(val);});
  
  })
  
  app.post("/confirm-reset",(req,res) => {
  
    
      const body = req.body;
  
      const token = body.token;
      const password = body.password;
  
      const dbRef = admin.database();
      const tokensRef = dbRef.ref("Tokens/"+token);


      tokensRef.once('value',snapshot => {
  
          const auth = admin.auth();
  
          var uid = null
          snapshot.forEach(child => {

                uid = child.val();
          })
  
          auth.updateUser(uid,{
            password:password
          })
            .then(user => {

              dbRef.ref("ExpiredTokens/"+token).remove();
              res.send({})
              
            })
            .catch(err => {
              console.log(err);
            })
            
          //Regardlesss if succeeded or not this token is gone.          
            tokensRef.remove();
  
      })
  
  })
  app.post("/reset-password", async (req,res)=>{

    const auth = admin.auth();
    const body = req.body;
    console.log("body", req.body);
    //This can stay realtime, since no real organization to structure needed here.
    const userRecord = await auth.getUserByEmail(body.email);
    const token = await uidGenerator.generate();
    const dbRef = admin.database();
    //Stores it alongside user.
    const tokenRef = dbRef.ref("Tokens/"+token)
    await tokenRef.push(userRecord.uid);

    const link = "'"+CES__HOME_URL+"account/reset?resetToken="+token+"'";

    const mailOptions = {
      from: process.env.NOTIFIER_EMAIL,
      to: body.email,
      subject:"Password Reset Request",
      html:"<p> Hello </p> <br> " + 
      "<p> Someone has requested a password reset for the account associated with this email. \
      If you did not make this request, ignore this email. </p> \
      <br><br><a href="+link+"> Click here to reset your password</a> <br><br> <p> Best, <br> Cogswell Engineering Society</p>",
    }

    await emailer.sendMail(mailOptions);
    res.send({});

    //Then I want server to await then delete this token after a day.
    //For testing low
    await snooze(10000);
  //  const expireRef = dbRef.ref("ExpiredTokens/"+token);
  //  expireRef.push(token);
    tokenRef.remove();
});



/*

  SSO ROUTES, to add here:
  *This is the central server, that will generate auth token.

*/


//Can't just store refresh token in db or here...Can I, would have to be in cookies or cache, a local storage..

//Could use this same route, to take in a refresh token, I could say fuck it and just have login page for each service.

app.post("/generate-auth-token", (req,res) => {
  
  const authRef = admin.auth();


  //Generates refresh token.
  //

  //Generates auth token.
  authRef.createCustomToken(req.body.uid)
    .then (customToken => {

      console.log("custom token",customToken);
      //Could send it here 
      res.cookie('refreshToken')
      res.cookie('authToken', )
      res.send({token:customToken});
    })

});


/*Updating users on posts*/


app.post("/notifySubscribers", async (req,res) => {


    //What kind of notice should be emailed
    //And notice info
    const {notificationType, notificationData} = req.body;

    const firestore = admin.firestore();
    const subsRef = firestore.collection("Subscribers");


    subsRef.get()
      .then(docsSnapshot => {

          docsSnapshot.docs.forEach( docSnapshot => {



            const subscriber = docSnapshot.data();

            if ((notificationType == "News" && subscriber.hasNewsSubscription) || 
            (notifcationType == "Event" && subscriber.hasEventsSubscription)){


              //Then add to users to notify, or just notify off the bat instead of waiting.
              const mailOptions = {

                from:process.env.NOTIFIER_EMAIL,
                to: subscriber.email,
                subject: "There has been a new " + notificationType + "post!",
                //This part could be cleaner, prob make functions for generating these.
                html: "<p> Hello, </p> <br> " +
                "<p> Click <a href = '" + notificationData.url + "'> here </a> to view the post</p>" +
                emailFooter

              };

              emailer.sendMail(mailOptions)
                .then (res => {

                  console.log("email sent to " + subscriber.email);
                })
                .catch(err => {

                  throw "Failed to notify " + subscriber.email;
                })

              
            }
          });
      })
      .catch (err => {

      });



});

app.post("/updateEventTrackers", async (req,res) => {


    //Okay, sent here.
   // console.log("req body", req.body);
    const {eventTags, postId} = req.body;

    //Okay, so this needs to first create the notification messsage.
    //Then loop through event tags, pulling eventid in tag, thne loop through trackers.

    //Subject and message will actually be created later.

    
    const firestore = admin.firestore();

    const eventsRef = firestore.collection("ClubInfo").doc("Events").collection("EventList");

    eventTags.forEach( tag => {


      const eventId = tag.eventUid;
      if ( eventUid == null) return;

      const docRef = eventsRef.doc(eventId);

      docRef.get()
        .then (eventSnapshot => {


          const event = eventSnapshot.data();

         // console.log("event", event);
          const trackersRef = docRef.collection("Trackers");
    
          const newsPath = "http://localhost:3000/news";
          trackersRef.get()   
          .then (docsSnapshot => {
    
              docsSnapshot.docs.forEach( doc => {
    
                  //redundant check.
                  if (doc.exists){
    
                    const trackerEmail = doc.data().email;
                    const mailOptions = {
    
                      from: process.env.NOTIFIER_EMAIL,
                      to: trackerEmail,
                      subject: "Update on " + event.title,
                      html: "<p> Hello, </p>" + 
                      "<br><br><br>"+
                      "<p> There has been a post related to the event you are tracking.</p>" +
                      "<p> Here is the <a href = " + newsPath + "/" + postId + "> link </a> to the post </p>" + 
                      emailFooter
                    };

                    emailer.sendMail(mailOptions)
                      .then ( response => {

                     //   console.log("email sent" ,response);
                      })
                      .catch( err => {

                        console.log("failed to send email: ", err);
                      })
                  }
              })
          })       
        })
        .catch(err => {

          console.log("Failed to update trackers for an event", err);
        })
     
    })

});